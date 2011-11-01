// Copyright 2011 WebDriver committers
// Copyright 2011 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Defines a special test case that runs each test inside of a
 * {@code webdriver.Application}. This allows each phase to schedule
 * asynchronous actions that run to completion before the next phase of the
 * test.
 *
 * This file requires the global {@code G_testRunner} to be initialized before
 * use. This can be accomplished by also importing {@code webdriver.jsunit}.
 * This namespace is not required by default to improve interoperability with
 * other namespaces that may initialize G_testRunner.
 */

goog.provide('webdriver.TestCase');

goog.require('goog.testing.TestCase');
goog.require('webdriver.asserts');
goog.require('webdriver.promise.Application');


/**
 * Constructs a test case that synchronizes each test case with the singleton
 * {@code webdriver.promise.Application}.
 *
 * @param {string=} opt_name The name of the test case, defaults to
 *     'Untitled Test Case'.
 * @constructor
 * @extends {goog.testing.TestCase}
 */
webdriver.TestCase = function(opt_name) {
  goog.base(this, opt_name);
};
goog.inherits(webdriver.TestCase, goog.testing.TestCase);


/**
 * Executes the next test inside its own {@code webdriver.Application}.
 * @override
 */
webdriver.TestCase.prototype.cycleTests = function() {
  var test = this.next();
  if (!test) {
    this.finalize();
    return;
  }

  goog.testing.TestCase.currentTestName = test.name;
  this.result_.runCount++;
  this.log('Running test: ' + test.name);

  var self = this;
  var hadError = false;

  this.runSingleTest_(test, onError).then(function() {
    hadError || self.doSuccess(test);
    self.timeout(function() {
      self.cycleTests();
    }, 100);
  });

  function onError(e) {
    hadError = true;
    // TODO(jleyba): Should we annotate the error with information about all
    // tasks that have been executed by the application?
    self.doError(test, e);
  }
};


/**
 * Executes a single test, scheduling each phase with the global application.
 * Each phase will wait for the application to go idle before moving on to the
 * next test phase.  This function models the follow basic test flow:
 *
 *   try {
 *     this.setUp.call(test.scope);
 *     test.ref.call(test.scope);
 *   } catch (ex) {
 *     onError(ex);
 *   } finally {
 *     try {
 *       this.tearDown.call(test.scope);
 *     } catch (e) {
 *       onError(e);
 *     }
 *   }
 *
 * @param {!goog.testing.TestCase.Test} test The test to run.
 * @param {function(*)} onError The function to call each time an error is
 *     detected.
 * @return {!webdriver.promise.Promise} A promise that will be resolved when the
 *     test has finished running.
 * @private
 */
webdriver.TestCase.prototype.runSingleTest_ = function(test, onError) {
  var app = webdriver.promise.Application.getInstance();
  return scheduleAndWait('setUp()', this.setUp)().
      addCallback(scheduleAndWait(test.name + '()', test.ref)).
      addErrback(onError).
      addCallback(scheduleAndWait('tearDown()', this.tearDown)).
      addErrback(onError);

  function scheduleAndWait(description, fn) {
    return function() {
      return app.scheduleAndWaitForIdle(description, goog.bind(fn, test.scope));
    }
  }
};
