"use strict"

var cfg        = require('config'),
    cheerio    = require('cheerio'),
    dateformat = require('dateformat'),
    log4js     = require('log4js'),
    request    = require('request');


// logs

log4js.configure(cfg.log.log4jsConfigs);

var log = log4js.getLogger(cfg.log.appName);
log.setLevel(cfg.log.level);



/**
 * A module for booking a class at Virgin Active
 * @module VirginActiveClass
 */



/**
 * Virgin Active class constructor.
 * @param {object}   params          - Params to be passed in
 * @param {string}   params.clubName - Name of the club
 * @param {string}   params.date     - of the class as seen in the timetable. yyyy-mm-dd format
 * @param {string}   params.name     - of the class as seen in the timetable
 * @param {string}   params.password - For login
 * @param {string}   params.time     - of the class. HH:MM format
 * @param {string}   params.username - For login
 *
 * @constructor
 */
function VirginActiveClass (params) {

  var self = this

  self.VAClass = {}
  self.auth    = {}

  var expectedParams = ['clubName', 'date', 'name', 'time']
  expectedParams.forEach (function (p) {
    if (!params.hasOwnProperty(p) || params[p] == "") {
      throw new Error('Expected paramater ' + p + ' not supplied')
    }
    self.VAClass[p] = params[p]
  })

  expectedParams = ['username', 'password']
  expectedParams.forEach (function (p) {
    if (!params.hasOwnProperty(p) || params[p] == "") {
      throw new Error('Expected paramater ' + p + ' not supplied')
    }
    self.auth[p] = params[p]
  })
}


var method = VirginActiveClass.prototype

// Some default configs
method._cfg = {
  va : {
    bookingUri: 'api/sitecore/VaClub/ViewTimetableBook',
    loginForm: {
      passwordField   : 'Password',
      rememberMeField : 'RememberMe',
      usernameField   : 'Username'
    },
    loginFormUri: 'login',
    loggedInCookieName : '.ASPXAUTH',
    userCookieName : '_user',
    renderingId: '064618dd-2b8d-4488-8fa0-57364f55aca0'
  }
}


// Setup the request defaults
method.vaRequest = request.defaults({
  baseUrl            : 'https://www.virginactive.co.uk',
  timeout            : cfg.reqTimeout || (1000*10),
  followAllRedirects : false,
  jar                : true,
  gzip               : true,
  headers: {
    'Accept'            : '*/*',
    'User-Agent'        : 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.23 Mobile Safari/537.36',
    'X-Requested-With'  : 'XMLHttpRequest',
    'Referer'           : 'https://www.virginactive.co.uk/login',
    'X-NewRelic-ID'     : 'VQYFVFRVCBAGU1ZSBQMC'
  }
});


/**
 * process
 *
 * @desc Books a class at VA
 *
 *
 * @alias process
 *
 * @param {object=} params - Parameters for request (currently no params supported)
 * @param {callback} cb    - The callback that handles the response. cb(err, bookingStatus)
 *
 * @return {string=} bookingStatus - Either "booked", "waitingList" or "full"
 */
method.process = function (params,cb) {

  var self = this
  log.info('VirginActive.process: ==>');

  // Log in
  self.doLogin (null, function (err) {

    if (err) {
      var errMsg = 'VirginActiveClass.process: Could not log in: ' + err;
      log.error(errMsg)
      cb(errMsg)
      return null;
    }

    self.bookClass (null, cb)

  })
}


/**
 * bookClass
 *
 * @desc Get details of a class and book it
 *
 * @param {object=} params - Parameters for request (currently no params supported)
 * @param {cb}      cb     - The callback that handles the response. Returns callback(error,bookingStatus)
 *
 * @return {string=} bookingStatus - Either "booked", "waitingList" or "full"
 *
 */
method.bookClass = function (params,cb) {

  var self = this

  // Create the URi for the club timetable. Eventually, it should look something like this:
  var clubName = this.VAClass.clubName.toLowerCase().replace(/ /g, '-')
  var uri  = 'clubs/' + clubName + '/timetable'

  log.info('VirginActive.bookClass: Getting timetable...');

  self.vaRequest.get({
    uri: uri
  }, function (err, resp, body) {

    if (err) { log.error(err); cb(err); return null }

    log.info('VirginActive.bookClass: Got timetable.')

    var $ = cheerio.load(body)

    // Get through the timetable data and, on finding the class, attempt to book it
    var ttd = $('script.timetable_data')

    if (ttd.length == 0) { cb('Timetable not as expected.'); return }
    log.debug('Found %s timetables', ttd.length)


    var classFound = false

    self.VAClass.startTime = self.getDate({date: self.VAClass.date, time: self.VAClass.time})
    log.info('Searching for class "%s" (%s).', self.VAClass.name, self.VAClass.startTime)

    for (var i = 0; i < ttd.length; i++) {

      var data = JSON.parse($( $(ttd)[i] ).html());

      for (var j = 0; j < data.classes.length; j++) {

        var c = data.classes[j]

        if (c.timetableName == self.VAClass.name
          && c.startTime == self.VAClass.startTime  ) {
          classFound = true

          self.VAClass.endTime = c.endTime

          // Check if we're already booked
          if (c.participationState == 'Booked') {
            log.info('Already booked in')
            cb(null, 'booked')
            return
          }

          // Bail out if the class is full
          if (c.classState == 'Full') {
            log.info('Class is full')
            cb(null, 'full')
            return
          }

          // Send a booking request

          log.info('VirginActive.bookClass: Making booking for class %s, clubId %s, clubName %s...', c.classId, c.clubId, self.VAClass.clubName)
          self.vaRequest.get({
            uri: self._cfg.va.bookingUri,
            qs: {
              classId:     c.classId,
              clubId:      c.clubId,
              clubName:    self.VAClass.clubName,
              renderingId: self._cfg.va.renderingId,
	    }
          }, function (err, resp, body) {

            if (err) { cb(err); return null }

            log.info('VirginActive.bookClass: Booking attempted.')

            $ = cheerio.load(body)
            var bookingResponse = $('h1.class-booking__title').text().replace('  ', ' ').trim()
            log.info('Booking response: ' + bookingResponse)

            if (bookingResponse == "You're booked") {
              log.info('VirginActive.bookClass: Booking successful.')
              self.VAClass.bookingStatus = 'booked'
              cb(null, 'booked')
            } else if (bookingResponse.match(/You're number \d+ on the waiting list/)) {
              log.info('VirginActive.bookClass: ' + bookingResponse)
              self.VAClass.bookingStatus = 'waitingList'
              cb(null, 'waitingList')
            } else {
              self.VAClass.bookingStatus = 'unknown'
              cb('Unknown booking status: ' + bookingResponse)
            }

          })

          break
        }
      }

      if (classFound) { break }

    }

    if (!classFound) {
      log.error('Class not found');
      self.VAClass.bookingStatus = 'notFound'
      cb('notFound');
      return null
    }
  })
}


/**
 * doLogin
 *
 * @desc Retrieve the VA login form, fill it out, and submit it
 *
 * @alias doLogin
 *
 * @param  {object=} params - Parameters for request (currently unused)
 * @param  {cb}      cb     - The callback that handles the response. Returns callback(error)
 *
 */
method.doLogin = function (params, cb) {

  var self = this

  log.info('VirginActive.doLogin: Getting form...')

  // Go to the login site
  self.vaRequest.get({
    uri: self._cfg.va.loginFormUri,
  }, function (err, resp, body) {

    if (err) { cb(err); return null }

    log.info('VirginActive.doLogin: Got form.')
    var $ = cheerio.load(body)
    var f = $('form')

    var form = {};

    // Get all the form attributes
    var attribs = f.attr()
    form['attribs'] = attribs


    // Get all the form inputs
    // Fill out the username and password as we're doing this
    var inputs = f.find('input');
    form['inputs'] = {}

    var isUsernamePresent = false
    var isPasswordPresent = false

    for (var i = 0; i < inputs.length; i++) {

      var fieldName = inputs.get(i).attribs.name
      var val       = inputs.get(i).attribs.value
      var loggedVal = val


      if (fieldName == self._cfg.va.loginForm.usernameField) {
        form['inputs'][fieldName] = self.auth.username
        isUsernamePresent = true
        loggedVal = '****'
      } else if (fieldName == self._cfg.va.loginForm.passwordField) {
        form['inputs'][fieldName] = self.auth.password
        isPasswordPresent = true
        loggedVal = '****'
      } else if (fieldName == self._cfg.va.loginForm.rememberMeField) {
        form['inputs'][fieldName] = 'false'
      } else {
        form['inputs'][fieldName] = inputs.get(i).attribs.value
      }

      log.info(fieldName + ' = ' + loggedVal)
    }


    // Take a bath if the form wasn't what we expected it to be
    if ( !( isUsernamePresent && isPasswordPresent ) ) {
      log.error('VirginActiveClass.doLogin: login form is not as expected')
      log.error(body)
      cb('VirginActiveClass.doLogin: login form is not as expected')
      return null
    }


    // Now submit the form

    log.info('VirginActive.doLogin: Logging in...');
    self.vaRequest({
      uri: form.attribs.action,
      method: form.attribs.method,
      form: form.inputs
    }, function (err, resp, body) {

      if (err) { cb(err); return null }

      log.info('VirginActive.doLogin: Login attempted.');

      // Look for the specific login cookie

      var cookies = resp.headers['set-cookie']
      if (!cookies) {
        log.error('VirginActive.doLogin: No cookies found.');
        log.error(JSON.stringify(resp));
        cb('Login response not as expected.')
        return null
      }

      var isLoggedInCookiePresent = false
      var isUserCookiePresent   = false

      for (var i = 0 ; i < cookies.length ; i ++ ) {
        var cookie = cookies[i].trim()
        var cookieName = cookie.split('=')[0]

        // We know we're logged in if we have this cookie
        if (cookieName == self._cfg.va.loggedInCookieName) { isLoggedInCookiePresent = true }
        if (cookieName == self._cfg.va.userCookieName)     { isUserCookiePresent     = true }
      }

      if ( isLoggedInCookiePresent && isUserCookiePresent ) {
        log.info('VirginActive.doLogin: Login and user cookies found.');
        cb(null)
      } else {
        log.error('VirginActive.doLogin: Cookie not found.');
        log.error('Cookies are: ' + cookies);
        log.error(JSON.stringify(resp));
        cb('Login unsuccessful.')
      }

    });

  });
}



/**
 * getDate
 *
 * @desc Create the start date + time of the class based on the date format provided
 *
 * @param {object=} params      -
 * @param {string}  params.date - This can either be a yyyy-MM-DD style date ("2017-12-15"),
 *                                or you can set the special value "one week later", which will set the date
 *                                one week after the current date. I.e. if today is the 3rd, it will set the
 *                                date to the 10th. This is particularly useful for booking classes automatically.
 * @param {string}  params.time - The time at which the class starts, in HH:MM format
 *
 * @return {string} date        - The date formatted to the way Virgin Active sets its class start times (yyyy-MM-DDTHH:mm:ss)
 *
 */
method.getDate = function (params,cb) {

  var targetDate

  if (params.date == "one week later") {
    targetDate = new Date()
    targetDate.setDate(targetDate.getDate()+7);
  } else {
    targetDate = new Date(params.date)
  }

  targetDate = dateformat(targetDate, 'yyyy-mm-dd') + 'T' + params.time + ":00"

  return targetDate
}


/**
 * getVAClassDetails
 *
 * @desc Get the details of the VA class. Useful after the booking has been attempted
 *
 * @param {object=} params    - Currently unused
 * @return {object} VAClass   -
 *   VAClass.bookingStatus
 *   VAClass.clubName
 *   VAClass.endTime
 *   VAClass.name
 *   VAClass.startTime
 *
 *
 */
method.getVAClassDetails = function (params) {

  var ret = {
    bookingStatus : this.VAClass.bookingStatus,
    clubName: this.VAClass.clubName,
    endTime : this.VAClass.endTime,
    name : this.VAClass.name,
    startTime : this.VAClass.startTime
  }

  return ret
}

module.exports = VirginActiveClass;
