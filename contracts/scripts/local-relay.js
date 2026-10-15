// Local relay: lets the public GitHub Pages site (https) talk to the Hardhat node on this laptop.
// Chrome's Private Network Access requires the local server to opt in with
// Access-Control-Allow-Private-Network; Hardhat doesn't send it, so this adds it.
// Listens on 127.0.0.1:8546 and forwards to the node on 127.0.0.1:8545. Run: npm run relay
const http = require("http");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Private-Network": "true",
};

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      return res.end();
    }
    const upstream = http.request(
      { host: "127.0.0.1", port: 8545, path: req.url, method: req.method, headers: { "content-type": "application/json" } },
      (up) => {
        res.writeHead(up.statusCode, { ...CORS, "Content-Type": "application/json" });
        up.pipe(res);
      }
    );
    upstream.on("error", (err) => {
      res.writeHead(502, CORS);
      res.end(JSON.stringify({ error: `Blockchain node not reachable: ${err.message}` }));
    });
    req.pipe(upstream);
  })
  .listen(8546, "127.0.0.1", () => console.log("PNA relay on http://127.0.0.1:8546 -> 127.0.0.1:8545"));
