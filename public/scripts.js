document.addEventListener('DOMContentLoaded', () => {
  // — login —
  const loginDiv  = document.getElementById('login-container');
  const dashDiv   = document.getElementById('dashboard');
  const devInput  = document.getElementById('login-deviceId');
  const pwdInput  = document.getElementById('login-password');
  const loginBtn  = document.getElementById('login-button');
  const errorEl   = document.getElementById('login-error');

  // — dashboard —
  const deviceNameEl = document.getElementById('deviceName');
  const motorTempEl  = document.getElementById('motorTemp');
  const motorVibEl   = document.getElementById('motorVibration');
  const tempCritIn   = document.getElementById('tempThreshold');
  const tempCritCur  = document.getElementById('tempCurrent');
  const vibCritIn    = document.getElementById('vibThreshold');
  const vibCritCur   = document.getElementById('vibCurrent');
  const tempAlarmLed = document.getElementById('tempAlarmLed');
  const vibAlarmLed  = document.getElementById('vibAlarmLed');
  const saveCritBtn  = document.getElementById('saveThresholdsBtn');
  const disableAlarmB= document.getElementById('deactivateAlarmBtn');
  const closeBtn     = document.getElementById('closeBtn');

  const socket = io.connect();
  let deviceId     = null;
  let loginPending = false;
  let loggedIn     = false;
  let loginTimeout = null;

  function showLoginError(msg) {
    errorEl.innerText = msg;
    loginBtn.disabled = false;
  }

  // — Entrar —
  loginBtn.addEventListener('click', () => {
    const dev = devInput.value.trim();
    const pwd = pwdInput.value;
    if (!dev || !pwd) return showLoginError('Debe ingresar DeviceID y contraseña');

    deviceId = dev;
    deviceNameEl.innerText = deviceId;
    loginBtn.disabled      = true;
    errorEl.innerText       = '';

    // 1) WS subscribe
    socket.emit('subscribe', deviceId);
    // 2) WS publish password
    socket.emit('publish', {
      topic: `${deviceId}/password`,
      message: pwd
    });
    // 3) espero respuesta mensaje
    loginPending = true;
    loginTimeout = setTimeout(() => {
      if (loginPending) {
        socket.emit('unsubscribe', deviceId);
        loginPending = false;
        showLoginError('Tiempo agotado de login');
      }
    }, 5000);
  });


/////////////////////////
  // ————— Inicializar gráficas —————

  const ctxTemp = document.getElementById('chartTempMotor').getContext('2d');
  const tempChart = new Chart(ctxTemp, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Temperatura Motor (°C)',
        data: [],
        fill: false,
        borderWidth: 2,
        tension: 0.2,
        pointRadius: 0,        // radio de los puntos = 0
        pointHoverRadius: 0   // igual al pasar el ratón
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: { display: true },
        y: { beginAtZero: true }
      }
    }
  });

// ————— Vibración (dual–axis) —————
const ctxVib = document.getElementById('chartVibMotor').getContext('2d');
  const vibChart = new Chart(ctxVib, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Vibración Maquina (mm/s)',
        data: [],
        fill: false,
        borderWidth: 2,
        tension: 0.2,
        pointRadius: 0,        // radio de los puntos = 0
        pointHoverRadius: 0   // igual al pasar el ratón
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: { display: true },
        y: { beginAtZero: false }
      }
    }
  });
  

  // Helper para añadir puntos y mantener ventana de 20 muestras
  function updateChart(chart, value) {
    const now = new Date().toLocaleTimeString();
    chart.data.labels.push(now);
    chart.data.datasets[0].data.push(parseFloat(value));
    if (chart.data.labels.length > 500) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update();
  }

//////////////////////////
  // — Handler global de updates —
  socket.on('deviceStatusUpdate', ({ device, control, state }) => {
    // login flow
    if (loginPending && device === deviceId && control === 'mensaje') {
      clearTimeout(loginTimeout);
      loginPending = false;
      if (state === 'OK') {
        loggedIn        = true;
        loginDiv.style.display = 'none';
        dashDiv.style.display  = 'block';
      } else {
        socket.emit('unsubscribe', deviceId);
        showLoginError('Credenciales incorrectas');
      }
      return;
    }

    // antes de login o topic de otro device → ignoro
    if (!loggedIn || device !== deviceId) return;

    // ya dentro → actualizar UI
    switch (control) {
      case 'temp':
        motorTempEl.innerText = `${state} °C`;
        updateChart(tempChart, state);         // <— aquí actualizo la gráfica
        break;
      case 'vibracion':
        motorVibEl.innerText = `${state} mm/s`;
        updateChart(vibChart, state);          // <— y aquí actualizo la gráfica
        break;
      case 'tempCritica':
        tempCritIn.value      = state;
        tempCritCur.innerText = `${state} °C`;
        break;
      case 'vibracionCritica':
        vibCritIn.value       = state;
        vibCritCur.innerText  = `${state} mm/s`;
        break;
      case 'tempAlarm':
        tempAlarmLed.classList.toggle('on', state === 'ON');
        break;
      case 'vibracionAlarm':
        vibAlarmLed.classList.toggle('on', state === 'ON');
        break;
      case 'buzzerStatus':
        // buzzerLed.classList.toggle('on', state === 'ON');
        break;
    }
  });

  // — acciones post-login —
  saveCritBtn.addEventListener('click', () => {
    socket.emit('publish',{ topic:`${deviceId}/tempCritica`,      message: tempCritIn.value });
    socket.emit('publish',{ topic:`${deviceId}/vibracionCritica`, message: vibCritIn.value  });
  });
  disableAlarmB.addEventListener('click', () => {
    socket.emit('publish',{ topic:`${deviceId}/buzzerControl`, message:'OFF' });
  });
  closeBtn.addEventListener('click', () => dashDiv.style.display = 'none');
  window.addEventListener('beforeunload', () => {
    if (deviceId) socket.emit('unsubscribe', deviceId);
  });
});
