# HANDOFF — скан 2026-08-30: гейт ИИ в P.A.N.D.A. Core — ЗАКРЫТА

Закрыта 2026-08-30, PR #293 (`cadba28`, 1.27.86). Core ходит в `/api/coach*`
через `safeFetch(..., 'ai')`; SSE — carry-buffer в `js/shared/sse.js`;
`_obFinish` снимает `inert` в `finally`. Не брали: бэкап merge-only;
онбординг без флага `onboarding-complete`.
