-- Сердцебиение keep-alive для бесплатного проекта Supabase (карточка SUPA-1).
--
-- ЧТО ДЕЛАЕТ. Таблица на одну строку и функция public.keepalive_ping(): она пишет
-- в эту строку pinged_at = now() и возвращает записанное время. Её зовёт
-- .github/workflows/supabase-keepalive.yml: POST /rest/v1/rpc/keepalive_ping
-- с anon-ключом, два прогона в сутки по три вызова.
--
-- ЗАЧЕМ ЗАПИСЬ, А НЕ ЧТЕНИЕ. Supabase паузит Free-проект, если за неделю он получил
-- мало «user database activity» (docs: guides/platform/free-project-pausing).
-- Прежний пинг был SELECT из workouts под anon: RLS отдавал пустой ответ, прогоны
-- 25.09, 28.09 и 01.10 зелёные, а к 04.10 проект всё равно уснул. Засчитывает ли
-- Supabase такой отфильтрованный SELECT, документация не говорит. UPDATE строки
-- точно доходит до Postgres и меняет данные, поэтому пингуем записью. Что именно
-- она засчитывается, остаётся гипотезой: её проверит неделя зелёных прогонов
-- без паузы.
--
-- ПОЧЕМУ SECURITY DEFINER ЗДЕСЬ БЕЗОПАСЕН.
--   - У функции нет аргументов: вызывающий ни на что не влияет.
--   - Она трогает одну строку (id = 1) одной таблицы и возвращает только время.
--   - set search_path = '' и полные имена (public.…): подменить таблицу
--     или функцию через search_path нельзя.
--   - EXECUTE есть только у anon. На таблице включён RLS без политик, права
--     anon и authenticated на неё отозваны: через REST её не прочитать и
--     не изменить.
--   - anon-ключ публичен, но держатель ключа может только обновить pinged_at,
--     то есть сделать ровно то, ради чего функция существует.
-- Advisor Supabase покажет предупреждение 0028 (anon может вызвать функцию
-- SECURITY DEFINER) и инфо 0008 (RLS включён без политик). Оба ожидаемы: это
-- вариант «осознанно открытый эндпоинт», входа у функции нет.
--
-- КАК ПРИМЕНИТЬ. Supabase Dashboard → проект → SQL Editor → New query → вставить
-- файл целиком → Run. Повторный запуск безопасен, всё идемпотентно. Затем GitHub →
-- Actions → Supabase keep-alive → Run workflow. Успех в логе: «Пинг 1/3: HTTP 200».
--
-- КАК ОТКАТИТЬ. В SQL Editor:
--   drop function if exists public.keepalive_ping();
--   drop table if exists public.keepalive_heartbeat;
-- После отката workflow краснеет с «SQL ещё не применён» (HTTP 404): его тоже
-- вернуть к прежней версии или выключить (Actions → … → Disable workflow).

create table if not exists public.keepalive_heartbeat (
  id smallint primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now()
);

-- Supabase по умолчанию раздаёт anon и authenticated все права на новые таблицы
-- в public. Здесь они не нужны: таблицу меняет только функция ниже.
alter table public.keepalive_heartbeat enable row level security;
revoke all on table public.keepalive_heartbeat from public, anon, authenticated;

insert into public.keepalive_heartbeat (id) values (1) on conflict (id) do nothing;

-- Upsert, а не голый update: если строку кто-то удалит, пинг вернёт её сам,
-- а не превратится в запрос, который ничего не пишет.
create or replace function public.keepalive_ping()
returns timestamptz
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.keepalive_heartbeat (id, pinged_at)
  values (1, now())
  on conflict (id) do update set pinged_at = excluded.pinged_at
  returning pinged_at;
$$;

-- У Postgres EXECUTE по умолчанию есть у PUBLIC, у Supabase ещё и у anon,
-- authenticated и service_role. Сначала снять у всех, потом выдать одному anon.
revoke all on function public.keepalive_ping() from public, anon, authenticated, service_role;
grant execute on function public.keepalive_ping() to anon;

-- PostgREST должен увидеть новую функцию, иначе /rest/v1/rpc отвечает 404.
notify pgrst, 'reload schema';
