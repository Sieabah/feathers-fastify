const fastify = require('fastify');
const Proto = require('uberproto');
const errorHandler = require('@feathersjs/errors/handler');
const notFound = require('@feathersjs/errors/not-found');
const debug = require('debug')('feathers-fastify');

const rest = require('./rest');

function feathersFastify (feathersApp) {
  if (!feathersApp) {
    return fastify();
  }

  if (typeof feathersApp.setup !== 'function') {
    throw new Error('feathers-fastify requires a valid Feathers application instance');
  }

  if (!feathersApp.version || feathersApp.version < '3.0.0') {
    throw new Error(`feathers-fastify requires an instance of a Feathers application version 3.x or later (got ${feathersApp.version || 'unknown'})`);
  }

  const fastifyApp = fastify();
  // An Uberproto mixin that provides the extended functionality
  const mixin = {
    use (location) {
      let service;
      let middleware = Array.from(arguments)
        .slice(1)
        .reduce(function (middleware, arg) {
          if (typeof arg === 'function') {
            middleware[service ? 'after' : 'before'].push(arg);
          } else if (!service) {
            service = arg;
          } else {
            throw new Error('Invalid options passed to app.use');
          }
          return middleware;
        }, {
          before: [],
          after: []
        });

      const hasMethod = methods => methods.some(name =>
        (service && !Array.isArray(service) && typeof service[name] === 'function')
      );

      // Check for service (any object with at least one service method)
      if (hasMethod(['handle', 'set']) || !hasMethod(this.methods.concat('setup'))) {
        debug('Passing app.use call to Fastify app');
        return this._super.apply(this, arguments);
      }

      debug('Registering service with middleware', middleware);
      // Since this is a serivce, call Feathers `.use`
      feathersApp.use.call(this, location, service, { middleware });

      return this;
    },

    listen () {
      const server = this._super.apply(this, arguments);

      this.setup(server);
      debug('Feathers application listening');

      return server;
    }
  };

  // Copy all non-existing properties (including non-enumerables)
  // that don't already exist on the Fastify app
  Object.getOwnPropertyNames(feathersApp).forEach(prop => {
    const feathersProp = Object.getOwnPropertyDescriptor(feathersApp, prop);
    const fastifyProp = Object.getOwnPropertyDescriptor(fastifyApp, prop);

    if (fastifyProp === undefined && feathersProp !== undefined) {
      Object.defineProperty(fastifyApp, prop, feathersProp);
    }
  });

  return Proto.mixin(mixin, fastifyApp);
}

module.exports = feathersFastify;

Object.assign(module.exports, fastify, {
  default: feathersFastify,
  original: fastify,
  rest,
  notFound,
  errorHandler
});
