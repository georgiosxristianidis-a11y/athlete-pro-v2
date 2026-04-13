export const Dashboard = {
  load: () => {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <section id="s-home">
        <h2>Dashboard</h2>
        <div class="stats-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
          <div style="background: var(--c-surface); padding: 15px; border-radius: 8px;">
            <div style="font-size: 12px; color: var(--c-text-2);">Workouts</div>
            <div style="font-size: 24px; font-weight: bold;" id="dash-workouts-count">0</div>
          </div>
          <div style="background: var(--c-surface); padding: 15px; border-radius: 8px;">
            <div style="font-size: 12px; color: var(--c-text-2);">Tonnage</div>
            <div style="font-size: 24px; font-weight: bold;" id="dash-tonnage">0 kg</div>
          </div>
        </div>
        <button class="btn" style="width: 100%;" onclick="startWorkout()">Start Workout</button>
      </section>
      <section id="s-train" style="display: none;"></section>
    `;
    
    window.startWorkout = async () => {
      const Workout = await window._loadWorkout();
      Workout.start();
      window.Nav.goTo('s-train');
    };

    Dashboard.updateStats();
  },
  updateStats: async () => {
    const workouts = await window.DB.Workouts.getAll();
    const countEl = document.getElementById('dash-workouts-count');
    if (countEl) countEl.textContent = workouts.length;
    
    let totalTonnage = 0;
    workouts.forEach(w => {
      if (w.tonnage) totalTonnage += w.tonnage;
    });
    const tonnageEl = document.getElementById('dash-tonnage');
    if (tonnageEl) tonnageEl.textContent = totalTonnage + ' kg';
  }
};
