"use strict"

var cfg        = require('config'),
    cheerio    = require('cheerio'),
    dateformat = require('dateformat'),
    log4js     = require('log4js'),
    request    = require('request'),
    Q          = require('q');


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

    switch(p) {
      case 'username':
      case 'password':
        self.auth[p] = params[p]
        break;
      default :
        self.VAClass[p] = params[p]
    }
  })
}


var method = VirginActiveClass.prototype

// Some default configs
method._cfg = {
  va : {
    bookClassUri: cfg.vaHost.bookClassUri,
    getClubIdUri: cfg.vaHost.getClubIdUri,
    getClassIdUri: cfg.vaHost.getClassIdUri,
    loginForm: {
      passwordField   : 'Password',
      rememberMeField : 'RememberMe',
      usernameField   : 'UserName'
    },
    loginFormUri: cfg.vaHost.loginFormUri,
    loggedInCookieNames : ['.AspNet.Cookies', 'va-auth', 'SF-TokenId'],
    renderingId: '064618dd-2b8d-4488-8fa0-57364f55aca0'
  }
}


// Setup the request defaults
method.vaRequest = request.defaults({
  baseUrl            : cfg.vaHost.baseUrl,
  timeout            : cfg.reqTimeout || (1000*10),
  followAllRedirects : true,
  followRedirect     : true,
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
 *
 * @param {object=} params - Parameters for request (currently no params supported)
 * @param {callback} cb    - The callback that handles the response. cb(err, bookingStatus)
 *
 * @return {string=} bookingStatus - Either "booked", "waitingList" or "full"
 */
method.process = function (params,cb) {

  var self = this
  var fn = 'VirginActiveClass.process: '

  log.info(fn + 'Processing...');

  var foundClubId

  // Log in
  var doLogin = Q.nbind(self.doLogin,self)
  Q.nfcall(doLogin,null)
  .then (function () {

    // Get the club ID
    var getClubId = Q.nbind(self.getClubId,self)
    return Q.nfcall(getClubId)

  })
  .then (function (clubId) {

    foundClubId = clubId

    // Get the intended class
    var getClassDetails = Q.nbind(self.getClassDetails,self)
    return Q.nfcall(getClassDetails, {clubId: clubId})

  })
  .then (function (classDetails) {

    // Check status and attempt a booking
    switch(classDetails.bookingAvailability) {
        case 'Full' :
          // No point trying
          return Q.resolve('full')
          break;
	case 'Available':
	case 'Waitlist':
          // Book it
          var bookClass = Q.nbind(self.bookClass,self)
          return Q.nfcall(bookClass, {clubId: foundClubId, classId: classDetails.id})
          break;
        default :
          return Q.reject('Unknown class status: ' + classDetails.bookingAvailability)
    }

  })
  .then (function (bookingStatus) {
    // Return the booking status
    // Status will be either "booked", "waitingList" or "full"
    log.info(fn + 'Booked class. Status - ' + bookingStatus);
    cb(null,bookingStatus)
  })
  .catch(function (e) {
    log.error(fn + e)
    cb(fn + e)
  })
  .done()

}


/**
 * bookClass
 *
 * @desc Book a class
 *
 * @param {object=} params -
 * @param {integer} params.classId - Id of the class being booked
 * @param {integer} params.cludId  - Id of the club at which the class is held
 * @param {cb}      cb     - The callback that handles the response. Returns callback(error,bookingStatus)
 *
 * @return {string=} bookingStatus - Either "booked", "waitingList" or "full"
 *
 */
method.bookClass = function (params,cb) {

  var self = this

  var fn = "VirginActive.bookClass: "
  var errPrefix = "Could not book class: "
  log.info(fn + 'Booking...');

  self.vaRequest.post({
    uri: self._cfg.va.bookClassUri,
    body: {
      clubId: "" + params.clubId,
      classId: params.classId
    },
    json: true
  }, function (err, resp, body) {

    if (err || resp.statusCode != 200 || body.error) {

      if (body && body.error) {
        err = body.error
      } else if (resp && resp.statusCode != 200) {
        err = "Resp statusCode " + resp.statusCode
        log.error(fn + 'Resp statusCode: ' + resp.statusCode);
        log.error(fn + 'Resp headers: ' + JSON.stringify(resp.headers));
      }

      log.error(fn + errPrefix + err);
      cb(errPrefix + err);
      return null
    }

    var retStatus

    switch(body.data.state) {
      case "BOOKED" :
        retStatus = "booked"
        break;
      case "OVERBOOKED_WAITINGLIST" :
        retStatus = "waitingList"
        break;
      default :
        err = errPrefix + 'unknown booking status: ' + body.data.state
        log.error(err);
        cb(err)
	return;
    }

    log.info('Booked class: ' + retStatus)

    cb(null,retStatus)
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

      switch(fieldName) {
        case self._cfg.va.loginForm.usernameField :
          form['inputs'][fieldName] = self.auth.username
          isUsernamePresent = true
          loggedVal = '****'
          break;
        case self._cfg.va.loginForm.passwordField :
          form['inputs'][fieldName] = self.auth.password
          isPasswordPresent = true
          loggedVal = '****'
          break;
	case self._cfg.va.loginForm.rememberMeField :
          form['inputs'][fieldName] = 'false'
          break;
        default :
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

    var cookieJar = request.jar()

    log.info('VirginActive.doLogin: Logging in...');
    self.vaRequest({
      uri: form.attribs.action,
      method: form.attribs.method,
      form: form.inputs,
      jar: cookieJar
    }, function (err, resp, body) {

      if (err) { cb(err); return null }

      log.info('VirginActive.doLogin: Login attempted.');

      // Look for the specific login cookie

      var cookies = cookieJar.getCookieString(cfg.vaHost.baseUrl)
      if (!cookies) {
        log.error('VirginActive.doLogin: No cookies found.');
        log.error(resp.body);
        cb('Login response not as expected.')
        return null
      } else {
        cookies = cookies.split(';')
        log.debug('Got cookies from jar: %s.', cookies);
      }

      var areLoggedInCookiesPresent = true
      var loggedInCookieNames = self._cfg.va.loggedInCookieNames

      for (var i = 0 ; i < loggedInCookieNames.length ; i ++ ) {

        var isCookieFound = false

        for (var j = 0 ; j < cookies.length ; j ++ ) {
          var cookie = cookies[j].trim()
          var cookieName = cookie.split('=')[0]

          // We know we're logged in if we have this cookie
          if (cookieName == loggedInCookieNames[i]) { isCookieFound = true ; break}
        }

	if (!isCookieFound) {
          areLoggedInCookiesPresent = false
          log.error('VirginActive.doLogin: Login cookie %s not found.', loggedInCookieNames[i]);
          break;
        }
      }


      if ( areLoggedInCookiesPresent ) {
        log.info('VirginActive.doLogin: Login cookies found.');
        cb(null)
      } else {
        log.error(JSON.stringify(resp,null,""));
        cb('Login unsuccessful.')
      }

    });

  });
}

/**
 * getClassDetails
 *
 * @desc Get the ID and booking status for the class from the name and time
 *
 * @param {object=} params
 * @param {integer} params.clubId - id of the club at which the class is held
 * @param {cb}      cb            - The callback that handles the response. Returns callback(error,classDetails)
 *
 * @returns {object} classDetails of the form:
 *   {
 *     id:
 *     bookingAvailability:
 *   }
 */
method.getClassDetails = function (params,cb) {

  var self = this

  var fn = "VirginActive.getClassDetails: "
  var errPrefix = "Could not get class: "
  log.info(fn + 'Getting...');

  self.vaRequest.get({
    uri: self._cfg.va.getClassIdUri,
    qs: {
      id: params.clubId
    },
    json: true
  }, function (err, resp, body) {

    if (err || resp.statusCode != 200 || body.error) {

      if (body && body.error) {
        err = body.error
      } else if (resp && resp.statusCode != 200) {
        err = "Resp statusCode " + resp.statusCode
        log.error(fn + 'Resp statusCode: ' + resp.statusCode);
        log.error(fn + 'Resp headers: ' + JSON.stringify(resp.headers));
      }

      log.error(fn + errPrefix + err);
      cb(errPrefix + err);
      return null
    }

    var thisClass

    if (body.data && body.data.classes) {
      thisClass = body.data.classes.find(function (c) {
        return (c.name == self.VAClass.name)
      })
    }

    if (!thisClass) {
      err = 'Class Id not found.'
      log.error(fn + err);
      log.error(JSON.stringify(body,null,""));
      cb(errPrefix + err);
      return null
    }

    thisClass = thisClass.id
    var thisClassTime

    if (body.data.classTimes) {
      thisClassTime = body.data.classTimes.find(function (ct) {
        if (ct.classId == thisClass) {
          var d1 = dateformat(ct.startTime,                                "isoDateTime")
          var d2 = dateformat(self.VAClass.date + " " + self.VAClass.time ,"isoDateTime")
          return (d1 == d2)
	}
        return false
      })
    }

    if (!thisClassTime) {
      err = 'Class timing not found.'
      log.error(fn + err);
      log.error(JSON.stringify(body,null,""));
      cb(errPrefix + err);
      return null
    }

    log.info('Found class ' + JSON.stringify(thisClassTime))

    cb(null,{
      id: thisClassTime.id,
      bookingAvailability: thisClassTime.status
    })
  })

}


/**
 * getClubId
 *
 * @desc Get the ID for the club from the name
 *
 * @param {object=} params - Parameters for request (currently no params supported)
 * @param {cb}      cb     - The callback that handles the response. Returns callback(error,clubId)
 *
 * @returns {integer}  clubId
 */
method.getClubId = function (params,cb) {

  var self = this

  var fn = "VirginActive.getClubId: "
  var errPrefix = "Could not get club: "
  log.info(fn + 'Getting...');

  self.vaRequest.get({
    uri: self._cfg.va.getClubIdUri,
    json: true
  }, function (err, resp, body) {

    if (err || resp.statusCode != 200 || body.error) {

      if (body.error) {
        err = body.error
      } else if (resp.StatusCode != 200) {
        err = "Resp statusCode " + resp.statusCode
        log.error(fn + 'Resp statusCode: ' + resp.statusCode);
        log.error(fn + 'Resp headers: ' + JSON.stringify(resp.headers));
      }

      log.error(fn + errPrefix + err);
      cb(errPrefix + err);
      return null
    }

    var thisClub

    if (body.data && body.data.clubs) {
      thisClub = body.data.clubs.find(function (club) {
        return (club.name == self.VAClass.clubName)
      })
    }

    if (!thisClub) {
      log.error(fn + 'Club Id not found.');
      log.error(JSON.stringify(body,null,""));
      cb('Club Id not found.');
      return null
    }

    log.debug('Found club ' + JSON.stringify(thisClub))

    cb(null,thisClub.clubId)
  })

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
