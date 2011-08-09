var cluster = require('cluster')
  , app = require('./app/app');

cluster(app)
  .use(cluster.logger('logs'))
  .use(cluster.stats())
  .use(cluster.pidfiles('pids'))
  .use(cluster.cli())
//  .use(cluster.repl(8888))
  .listen(8006);