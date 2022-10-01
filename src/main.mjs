import { program } from 'commander';
import * as http from 'http';
import * as impl from './impl.mjs';
import * as url from 'url';

function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

async function main() {
  // console.log(process.argv);
  program
    .option('-s, --socks [socks]', 'SOCKS server, default: 127.0.0.1:1080')
    .option('-f, --proxyList [proxyList]', 'File contains SOCKS servers per line')
    .option('-l, --listen [listen]', 'Listening on, default: 127.0.0.1:8080')
    .parse();

  const DEFAULT_OPTIONS = {
    listen: '127.0.0.1:8080',
    socks: '127.0.0.1:1080',
    // proxyListReloadIntevalInSec: 60,
  };

  const options = Object.assign({}, DEFAULT_OPTIONS, program.opts());
  // console.log(options);

  const { socks } = options;
  const ph = url.parse(`http://${options.listen}`);
  const host = ph.hostname;
  const port = parseInt(ph.port, 10);

  // eslint-disable-next-line
  console.log(`Listening http://${host}:${port} to socks://${socks}`);

  let proxyList = [];

  const reloadProxyList = async () => {
    if (options.socks) {
      proxyList = impl.loadProxy(options.socks);
    } else if (options.proxyList) {
      proxyList = await impl.loadProxyFile(options.proxyList);
    }
  }

  await reloadProxyList();
  if (options.proxyListReloadIntevalInSec) {
    setInterval(
      reloadProxyList,
      options.proxyListReloadIntevalInSec * 1000
    );
  }

  const getProxyInfo = () => randomElement(proxyList);

  const getProxyAgent = () => {
    const proxy = getProxyInfo();
    const socksAgent = new socks.Agent({
      proxy,
      target: { host: ph.hostname, port: ph.port },
    });
    return socksAgent;
  }

  const server = http.createServer();
  server.on('request', impl.requestListener.bind(null, getProxyAgent)); // default HTTP request
  server.on('connect', impl.connectListener.bind(null, getProxyInfo));  // method CONNECT
  server.listen(port, host);
}

export {
  main,
};
