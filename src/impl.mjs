import * as fs from 'fs/promises';
import * as http from 'http';
import * as socks from 'socks';
import * as url from 'url';

const logger = console;

function getProxyObject(host, port, username, password) {
  return {
    type: 5,
    host,
    port: parseInt(port, 10),
    userId: username || '',
    password: password || '',
  };
}

function parseProxyLine(line) {
  const proxyInfo = line.split(':');

  if (proxyInfo.length !== 4 && proxyInfo.length !== 2) {
    throw new Error(`Incorrect proxy line: ${line}`);
  }

  return getProxyObject.apply(this, proxyInfo);
}

function loadProxy(proxyLine) {
  const proxyList = [];
  try {
    proxyList.push(parseProxyLine(proxyLine));
  } catch (ex) {
    logger.error(ex.message);
  }
  return proxyList;
}

async function loadProxyFile(fileName) {
  const data = await fs.readFile(fileName, 'utf-8');

  const lines = data.toString().split('\n');
  const proxyList = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!(lines[i] !== '' && lines[i].charAt(0) !== '#')) {
      try {
        proxyList.push(parseProxyLine(lines[i]));
      } catch (ex) {
        logger.error(ex.message);
      }
    }
  }
  return proxyList;
}

async function requestListener(fnGetAgent, request, response) {
  // logger.info(`request: ${request.url}`);
  const ph = url.parse(request.url);

  const options = {
    hostname: ph.hostname,
    port: ph.port,
    method: request.method,
    path: ph.path,
    headers: request.headers,
    agent: fnGetAgent(),
  };

  const proxyRequest = http.request(options);

  request.on('error', async (err) => {
    logger.error(`request-Local: ${err.message}`);
    proxyRequest.destroy(err);
  });

  proxyRequest.on('error', async (err) => {
    logger.error(`request-Proxy: ${err.message}. proxy=${options.agent.host}:${options.agent.port}`);
    response.writeHead(500).end('Connection error\n');
  });

  proxyRequest.on('response', async (proxyResponse) => {
    // logger.info(`request-Response: ${ph.host}:${ph.port}`);
    response.writeHead(proxyResponse.statusCode, proxyResponse.headers);
    proxyResponse.pipe(response);
  });

  request.pipe(proxyRequest);
}

async function connectListener(fnGetProxy, request, localSocket, head) {
  const proxy = fnGetProxy();

  const ph = url.parse(`http://${request.url}`);
  const host = ph.hostname;
  const port = parseInt(ph.port, 10);

  const options = {
    proxy,
    command: 'connect',
    destination: { host, port },
  };

  // logger.info(`connect ${host}:${port}`);

  let conn = null;

  localSocket.on('error', async (err) => {
    logger.error(`connect-Local: ${err.message}`);
    if (conn) {
      proxySocket.destroy(err);
    }
  });

  try {
    const proxyConnection = await socks.SocksClient.createConnection(options);

    const proxySocket = proxyConnection.socket;

    localSocket.on('end', async () => {
      // logger.info(`connect-Local: end ${host}:${port}`);
      localSocket.unpipe(proxySocket);
      proxySocket.end();
    })

    // localSocket.on('close', async () => {
    //   // logger.info(`connect-Local: close ${host}:${port}`);
    //   proxySocket.end();
    // });

    proxySocket.on('error', async (err) => {
      logger.error(`connect-Proxy: ${err.message}. proxy=${host}:${port}`);
      localSocket.destroy(err);
    });

    proxySocket.on('end', async () => {
      // logger.info(`connect-Proxy: end ${host}:${port}`);
      proxySocket.unpipe(localSocket);
      localSocket.end();
    })

    // proxySocket.on('close', async () => {
    //   // logger.info(`connect-Local: close ${host}:${port}`);
    //   localSocket.end();
    // });

    localSocket.write(`HTTP/${request.httpVersion} 200 Connection established\r\n\r\n`);
    proxySocket.write(head);

    proxySocket.pipe(localSocket);
    localSocket.pipe(proxySocket);
  }
  catch (err) {
    logger.error(`connect-Library: ${err.message}`);
    localSocket.write(`HTTP/${request.httpVersion} 500 Connection error\r\n\r\n`);
    return;
  }
}

export {
  getProxyObject,
  parseProxyLine,
  loadProxy,
  loadProxyFile,
  requestListener,
  connectListener,
};
