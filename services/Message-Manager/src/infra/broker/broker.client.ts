// import { BrokerClientType } from "shared/types/broker.type";
import { logger } from "cash-lib/config/logger";

class BrokerClient {
// class BrokerClient implements BrokerClientType{

  constructor(
    private subscribers = {},
    private queues = {}
  ){ }

  async connect(): Promise<void> {
    // Example: TCP / gRPC / HTTP2 handshake
    logger.info('Connecting to custom message broker');
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting from custom message broker');
  }
  
  isHealthy() {
      return true;
  }
}

export const createBrokerClient = () => new BrokerClient();


/**
* Supporter :
  * **Publish / Subscribe**
  * **Queues (work distribution)**
[ Service A ] ---> publish ---> [ BROKER ] ---> deliver ---> [ Service B ]
                                   |
                                   +--> [ Service C ]
```
Concepts :
* **Topic** : canal de publication
* **Subscribers** : services enregistrés sur un topic
* **Queue** : messages consommés une seule fois
const subscribers = {}; // topic -> [{ callback }]
const queues = {};      // queue -> [messages]

function send(callback, message) {
  const data = JSON.stringify(message);

  const req = http.request(callback, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data)
    }
  });

  req.on("error", () => {});
  req.write(data);
  req.end();
}

const server = http.createServer((req, res) => {
  let body = "";

  req.on("data", chunk => body += chunk);
  req.on("end", () => {
    const msg = JSON.parse(body);

    // SUBSCRIBE
    if (msg.type === "subscribe") {
      subscribers[msg.topic] ??= [];
      subscribers[msg.topic].push({ callback: msg.callback });

      res.end("subscribed");
      return;
    }

    // PUBLISH
    if (msg.type === "publish") {
      const subs = subscribers[msg.topic] || [];

      for (const sub of subs) {
        send(sub.callback, {
          topic: msg.topic,
          payload: msg.payload
        });
      }

      res.end("published");
      return;
    }

    res.statusCode = 400;
    res.end("invalid message");
  });
});

## 🧪 Exemple de consumer

```js
const http = require("http");

http.createServer((req, res) => {
  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    console.log("EVENT RECEIVED:", JSON.parse(body));
    res.end("ok");
  });
}).listen(4001);
```

## 🧪 Exemple de producer

```js
const http = require("http");

const message = JSON.stringify({
  type: "publish",
  topic: "user.created",
  payload: { id: 42 }
});

const req = http.request("http://localhost:3000", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(message)
  }
});

req.write(message);
req.end();
```