const express    = require('express');
const mqtt       = require('mqtt');
const fs         = require('fs');
const http       = require('http');
const bodyParser = require('body-parser');
const socketIo   = require('socket.io');

// Express
const app  = express();
const port = process.env.PORT || 3000;
app.use(bodyParser.json());
app.use(express.static('public'));

// HTTP + WebSocket
const httpServer = http.createServer(app);
const io         = socketIo(httpServer);

// MQTT
const mqttClient = mqtt.connect(
  'mqtts://d8badc4d4c1749ea9b0f242d1e1a0c91.s1.eu.hivemq.cloud:8883',
  {
    username: 'UserMQTT',
    password: '12345678',
    ca: fs.readFileSync('./certs/ca.crt')
  }
);

// 1) Conexión MQTT
mqttClient.on('connect', () => {
  console.log('🔌 Conectado al broker MQTT');
});

// 2) Reenvío de mensajes MQTT a clientes WS
mqttClient.on('message', (topic, message) => {
  const msg = message.toString();
  console.log(`📩 ${topic} → ${msg}`);

  const [ deviceId, controlId ] = topic.split('/');
  io.emit('deviceStatusUpdate', { device: deviceId, control: controlId, state: msg });
});

// 3) Rutas HTTP (si aún las necesitas)
app.get('/device', (req, res) => {
  const deviceId = req.query.device;
  // Aquí podrías validar devices…
  return res.sendFile(__dirname + '/public/index.html');
});

// (Opcionalmente mantén /control si no quieres usar solo WS)
// …

// 4) WebSocket: subscribe, unsubscribe y publish
io.on('connection', socket => {
  console.log('🔗 Cliente WS conectado:', socket.id);

  // a) subscribe: recibe un deviceId
  socket.on('subscribe', deviceId => {
    console.log(`➕ WS subscribe a ${deviceId}`);
    const topics = [
      `${deviceId}/temp`,
      `${deviceId}/vibracion`,
      `${deviceId}/tempCritica`,
      `${deviceId}/vibracionCritica`,
      `${deviceId}/tempAlarm`,
      `${deviceId}/vibracionAlarm`,
      `${deviceId}/buzzerStatus`,
      `${deviceId}/mensaje`,
    ];
    topics.forEach(t => {
      mqttClient.subscribe(t, err => {
        if (err) console.error(`❌ subscribe ${t}`, err);
        else     console.log(`✅ subscrito a ${t}`);
      });
    });
    socket.deviceId = deviceId;
    socket.topics   = topics;
  });

  // b) unsubscribe explícito
  socket.on('unsubscribe', deviceId => {
    console.log(`➖ WS unsubscribe de ${deviceId}`);
    if (socket.topics) {
      socket.topics.forEach(t => {
        mqttClient.unsubscribe(t, err => {
          if (err) console.error(`❌ unsubscribe ${t}`, err);
          else     console.log(`✅ desuscrito de ${t}`);
        });
      });
      delete socket.topics;
      delete socket.deviceId;
    }
  });

  // c) publish: recibe { topic, message }
  socket.on('publish', ({ topic, message }) => {
    mqttClient.publish(topic, message, err => {
      if (err) console.error(`❌ publish ${topic}`, err);
      else     console.log(`✅ publicado WS → ${topic}: ${message}`);
    });
  });

  // d) al desconectarse, limpio suscripciones
  socket.on('disconnect', () => {
    console.log('❌ Cliente WS desconectado:', socket.id);
    if (socket.topics) {
      socket.topics.forEach(t => mqttClient.unsubscribe(t));
    }
  });
});

// Arrancar servidor
httpServer.listen(port, () => {
  console.log(`🚀 API corriendo en puerto ${port}`);
});
