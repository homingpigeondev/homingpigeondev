#!/usr/bin/env node
'use strict';

const { main, fail } = require('../src/cli');

const argv = process.argv.slice(2);
main(argv).catch((err) => fail(err, argv));
