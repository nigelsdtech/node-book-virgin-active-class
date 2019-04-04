var cfg                = require('config');
var chai               = require('chai');
var dateformat         = require('dateformat');
var fs                 = require('fs');
var nock               = require('nock');
var sinon              = require('sinon');
var VirginActiveClass  = require('../../lib/VirginActiveClass.js');

/*
 * Set up chai
 */
chai.should();


// Common testing timeout
var timeout = cfg.testTimeout || (5*1000);

var vaHost = cfg.vaHost.baseUrl



/*
 * Utility functions
 */

/**
 * testUnexpectedResponses
 *
 * Tests for bad connectivity or an unexpected response when calling a website
 *
 * @param {object=}  params
 * @param {string}   params.describe   - Description of the service that is failing
 * @param {function} params.errMsg     - The message displayed when the page is not as expected
 * @param {function} params.vacObj     - The VirginActiveClass object being tested
 * @param {string}   params.vacFn      - The name of the function to be called in the VirginActiveClas
 * @param {object}   params.nockObj    - An object containing the nock stub. Have to do it this way so we're passing an object reference to this proc and can change its value in real time
 * @param {object}   params.nockObj.fn - The nock stub
 * @param {boolean}  params.only       - True if you only want to run this scenario
 *
 */
function testUnexpectedResponses(params) {

  var descFn = describe
  if (params.only) { descFn = describe.only }

  descFn(params.describe, function () {
    it.skip('returns an error if the connection times out', function (done) {

      params.nockObj.fn
      .socketDelay(6*1000)
      .reply(200,'should timeout before getting this body')

      params.vacObj[params.vacFn](null, function (e, form) {
        e.code.should.equal('ESOCKETTIMEDOUT');
        done();
      })
    });

    it('returns an error if the page is not as expected', function (done) {

      params.nockObj.fn
      .reply(503,'some bad body')

      params.vacObj[params.vacFn](null, function (e, form) {
        e.should.equal(params.errMsg);
        done();
      })
    });
  });
}


/**
 * setupBasicAPITests
 *
 * Simple framework for creating + running a set of tests on an API response
 *
 * @param {object=}  params
 * @param {string}   params.fnName                    - The name of the function to be called in the Class
 * @param {context}  params.callerContext             - The "this" context of the caller
 * @param {object=}  params.reqDetails
 * @param {string}   params.reqDetails.uri            - The URI being hit
 * @param {string=}  params.reqDetails.method         - The http method to use. Either "get" or "post".
 * @param {object}   params.reqDetails.qs             - The query string sent with the request (optional)
 * @param {object=}  params.tests[]
 * @param {string}   params.tests.expectedErr         - Error the user expects to see. Send in either this or expectedRet
 * @param {string}   params.tests.expectedRet         - Return value the user expects to see. Send in either this or expectedError
 * @param {object}   params.tests.inputArgs           - Input arg to be sent in when executing the function
 * @param {boolean}  params.tests.only                - True if you only want to run this scenario
 * @param {object=}  params.tests.stubbedResponse
 * @param {integer}  params.tests.stubbedResponse.statusCode - HTTP status code of the return
 * @param {string}   params.tests.stubbedResponse.body       - HTTP body of the return
 * @param {string}   params.tests.testInfo            - Description of behaviour (corresponds to 'it' function in Mocha)
 *
 */
function setupBasicAPITests(params) {

  params.callerContext.timeout(timeout)

  // This is an object so its real-time value can be passed to downstream functions
  var nockIntercept = {}
  var vac  = getNewVAC();

  beforeEach (function () {
    nockIntercept = nock(vaHost)
    .log(console.log)
    .intercept(params.reqDetails.uri, params.reqDetails.method)

    if (params.reqDetails.qs) {
      nockIntercept.query(params.reqDetails.qs)
    }

  })

  afterEach (function () {
    nock.cleanAll()
  })

  /*
  testUnexpectedResponses({
    describe: 'Problems with the request',
    errMsg: 'Could not get clubs: Resp statusCode 503',
    vacObj: vac,
    vacFn: 'getClubId',
    nockObj: nockGetClubs
  })
  */

  params.tests.forEach(function (test) {

    if (!test.stubbedResponse.statusCode) {
      test.stubbedResponse.statusCode = 200
    }

    var itFn = it
    if (test.only) { itFn = it.only }

    itFn(test.testInfo, function (done) {
        nockIntercept
        .reply(test.stubbedResponse.statusCode, test.stubbedResponse.body)

        vac[params.fnName](test.inputArgs, function (e,ret) {

          if (test.expectedErr) {
            e.should.equal(test.expectedErr)
          } else {
            chai.expect(e).to.not.exist
            ret.should.deep.equal(test.expectedRet)
          }

          done();
        })
    })
  })

}


/**
 * getNewVAC
 *
 * Quickly generates a new VAC object
 *
 * @param {object=}  params
 * @param {string}   params.date - Class date in yyyy-mm-dd format
 * @param {string}   params.name - Class name
 * @param {string}   params.time - Class time in HH:MM format
 *
 * @returns {object} A VirginActiveClass object
 *
 */
function getNewVAC (params) {

  var p = {
    clubName : 'Fiction Club',
    date : '2019-03-29',
    name : 'Super duper abs',
    password : 'testPassword',
    time : '18:30',
    username : 'HulkHogan'
  }

  if (params && params.hasOwnProperty('date')) { p.date = params.date }
  if (params && params.hasOwnProperty('name')) { p.name = params.name }
  if (params && params.hasOwnProperty('time')) { p.time = params.time }


  var vac = new VirginActiveClass(p)

  return vac
}


/*
 * The actual tests
 */

describe('VirginActiveClass.doLogin', function () {

  this.timeout(timeout)

  // This is an object so its real-time value can be passed to downstream functions
  var nockGetForm = {}
  var vac = getNewVAC();
  var self = this

  beforeEach (function () {
    nockGetForm.fn = nock(vaHost)
    .get(cfg.vaHost.loginFormUri)
    .query(false)
  })

  afterEach (function () {
    nock.cleanAll()
  })


  testUnexpectedResponses({
    describe: 'Problems getting the login form',
    errMsg: 'VirginActiveClass.doLogin: login form is not as expected',
    vacObj: vac,
    vacFn: 'doLogin',
    nockObj: nockGetForm
  })


  describe('Getting the login form successfully', function () {

    var loginForm = fs.readFileSync('./test/data/login_form.html')
    var nockSubmitForm = {}

    beforeEach (function () {
      nockGetForm.fn
      .reply(200,loginForm)

      nockSubmitForm.fn = nock(vaHost)
      .post('/login')
      .query(true)
    })

    afterEach (function () {
      nock.cleanAll()
    })


    testUnexpectedResponses({
      describe: 'Problems submitting the login form',
      errMsg: 'Login response not as expected.',
      vacObj: vac,
      vacFn: 'doLogin',
      nockObj: nockSubmitForm
    })


    it('returns a successful login', function (done) {


      /*
       *  These requests go as follows:
       *
       *  /login?sf_cntrl_id=ctl00%24Body%24C001 -> 302
       *  /Sitefinity/Authenticate/SWT?some_params=something -> 302 (returns va-auth cookie)
       *  /my-account?some_other_params=something_else -> 200 (returns cookies: SF-TokenId, .AspNet.Cookies)
       */

      // Get a sample of a "good" login page
      // this is /login
      nockSubmitForm.fn
      .reply(302, 'This login page should redirect', {
        'Location': cfg.vaHost.baseUrl + '/Sitefinity/Authenticate/SWT?some_param=something'
      })

      // this is /Sitefinity
      nock(vaHost)
      .get('/Sitefinity/Authenticate/SWT')
      .query(true)
      .reply(302, 'This Sitefinity page should redirect', {
        'Location': cfg.vaHost.baseUrl + '/my-account?some_param=something',
        'Set-Cookie': ['va-auth=abcdefg; path=/; secure; HttpOnly']
      })

      // this is /my-account
      nock(vaHost)
      .get('/my-account')
      .query(true)
      .reply(200, 'This is the final login page', {
        'Set-Cookie': ['SF-TokenId=12345; path=/', '.AspNet.Cookies=abcdefg; path=/; secure; HttpOnly']
      })

      vac.doLogin(null, function (e) {
        chai.expect(e).to.not.exist
        done();
      })

    });
  });
});


describe('VirginActiveClass.getClassDetails', function () {

  var tests = [{
    testInfo       : 'returns an error when the url gives a response but body.error is set',
    expectedErr    : 'Could not get class: body.error was set',
    stubbedResponse: {
      body : { something: 'No class for you', error: 'body.error was set'},
    }}, {

    testInfo       : 'returns an error when the url gives a response but the class can\'t be found',
    expectedErr    : 'Could not get class: Class Id not found.',
    stubbedResponse: {
      body : { error: null, data : { classes: [{name: 'Not your class',id: 1}, {name: 'Also not your class',id: 2}] } }
    }}, {

    testInfo       : 'returns an error when the url gives a response but the class timing can\'t be found',
    expectedErr    : 'Could not get class: Class timing not found.',
    stubbedResponse : {
      body : JSON.parse(fs.readFileSync('./test/data/getClubTimetable.json','utf8').replace("TEST_CLASS_DATE","2019-03-30"))
    }}, {

    testInfo       : 'Response is ok and the class with the timing is found',
    expectedRet    : {id:123456, bookingAvailability: "TEST_CLASS_STATUS"},
    stubbedResponse: {
      body : JSON.parse(fs.readFileSync('./test/data/getClubTimetable.json','utf8').replace("TEST_CLASS_DATE","2019-03-29"))
    }
  }]

  tests.forEach (function (t) { t.inputArgs = {clubId : 421} } )

  setupBasicAPITests({
    fnName : 'getClassDetails',
    callerContext: this,
    reqDetails : {
      uri: cfg.vaHost.getClassIdUri,
      method: 'get',
      qs: {id: 421},
    },
    tests: tests
  })

})


describe('VirginActiveClass.getClubId', function () {

  var tests = [{
    testInfo       : 'returns an error when the url gives a response but body.error is set',
    expectedErr    : 'Could not get club: body.error was set',
    stubbedResponse: {
      body : {error: 'body.error was set', clubs: 'No clubs for you'}
    }
  }, {
    testInfo       : 'returns an error when the url gives a response but the club can\'t be found',
    expectedErr    : 'Club Id not found.',
    stubbedResponse: {
      body : { error: null, data : { clubs: [ { name: 'Not your club', clubId: 1 }, { name: 'Also not your club', clubId: 2 }] } },
    }
  }, {
    testInfo       : 'Response is ok and the club is found',
    expectedRet    : 2,
    stubbedResponse: {
      body : JSON.parse(fs.readFileSync('./test/data/getClubDetails.json'))
    }
  }]

  setupBasicAPITests({
    fnName : 'getClubId',
    callerContext: this,
    reqDetails : {
      uri: cfg.vaHost.getClubIdUri,
      method: 'get'
    },
    tests: tests
  })

})


describe('VirginActiveClass.getDate', function () {

  var vac = getNewVAC();

  var d = new Date()
  d.setDate(d.getDate()+7)
  var o = dateformat(d, 'yyyy-mm-dd')

  var tests = [{
    desc:   'correctly interprets a date that is passed in for am',
    date:   '2018-02-02',
    time:   '09:30',
    output: '2018-02-02T09:30:00' } , {

    desc:   'correctly interprets a date that is passed in for pm',
    date:   '2018-02-02',
    time:   '19:05',
    output: '2018-02-02T19:05:00' } , {

    desc:   'correctly interprets the string "one week later" for am',
    date:   'one week later',
    time:   '10:00',
    output: o + 'T10:00:00' }, {

    desc:   'correctly interprets the string "one week later" for pm',
    date:   'one week later',
    time:   '18:12',
    output: o + 'T18:12:00' }]



  tests.forEach( function(t) {
    it(t.desc, function() {
      var d = vac.getDate({
        date: t.date,
        time: t.time
      })

      d.should.equal(t.output)
    })
  })


})



describe('VirginActiveClass.bookClass', function () {

  var tests = [{
    testInfo       : 'returns an error when the url gives a response but body.error is set',
    expectedErr    : 'Could not book class: body.error was set',
    stubbedResponse: {
      body : { something: 'No class for you', error: 'body.error was set'},
    }}, {

    testInfo       : 'returns an error when the url gives a response but booking state is unrecognized',
    expectedErr    : 'Could not book class: unknown booking status: TEST_BOOKING_STATE',
    stubbedResponse: {
      body : JSON.parse(fs.readFileSync('./test/data/BookClass.json','utf8'))
    }}, {

    testInfo       : 'Response is ok and the user is on the waiting list',
    expectedRet    : 'waitingList',
    stubbedResponse: {
      body : JSON.parse(fs.readFileSync('./test/data/BookClass.json','utf8').replace("TEST_BOOKING_STATE","OVERBOOKED_WAITINGLIST"))
    }}, {

    testInfo       : 'Response is ok and the class has been booked',
    expectedRet    : 'booked',
    stubbedResponse: {
      body : JSON.parse(fs.readFileSync('./test/data/BookClass.json','utf8').replace("TEST_BOOKING_STATE","BOOKED"))
    }
  }]

  tests.forEach (function (t) { t.inputArgs = {clubId : 421, classId: 123} } )

  setupBasicAPITests({
    fnName : 'bookClass',
    callerContext: this,
    reqDetails : {
      uri: cfg.vaHost.bookClassUri,
      method: 'post',
      body: {clubId: "421", classId: 123},
    },
    tests: tests
  })

});



describe('VirginActiveClass.process', function () {

  this.timeout(timeout)
  var vac, loginStub, getClubStub, getClassStub, bookingStub

  beforeEach ( function () {
    vac = getNewVAC()
    loginStub    = sinon.stub(vac, 'doLogin')
    getClubStub  = sinon.stub(vac, 'getClubId')
    getClassStub = sinon.stub(vac, 'getClassDetails')
    bookingStub  = sinon.stub(vac, 'bookClass')
  })

  afterEach ( function () {
    loginStub.reset()
    getClubStub.reset()
    getClassStub.reset()
    bookingStub.reset()
    vac = {}
  })

  it('returns an error when there are problems logging in', function (done) {
    loginStub.yields('Simulated login error')

    vac.process(null, function (err) {
      err.should.equal('VirginActiveClass.process: Simulated login error')
      getClubStub .called.should.equal(false)
      getClassStub.called.should.equal(false)
      bookingStub .called.should.equal(false)
      done()
    })
  })

  it('returns an error when there are problems getting the club id', function (done) {
    loginStub.yields(null)
    getClubStub.yields('Simulated club id error')

    vac.process(null, function (err, bookingStatus) {
      err.should.equal('VirginActiveClass.process: Simulated club id error')
      getClassStub.called.should.equal(false)
      bookingStub .called.should.equal(false)
      done()
    })
  })

  it('returns an error when there are problems getting the class id', function (done) {
    loginStub.yields(null)
    getClubStub.yields(null, 421)
    getClassStub.yields('Simulated class id error')

    vac.process(null, function (err, bookingStatus) {
      err.should.equal('VirginActiveClass.process: Simulated class id error')
      bookingStub.called.should.equal(false)
      done()
    })
  })

  it('returns an error when there is an unrecognized class status', function (done) {
    loginStub.yields(null)
    getClubStub.yields(null, 421)
    getClassStub.yields(null, {id: 123, bookingAvailability: 'Something odd'})

    vac.process(null, function (err, bookingStatus) {
      err.should.equal('VirginActiveClass.process: Unknown class status: Something odd')
      bookingStub.called.should.equal(false)
      done()
    })
  })

  it('returns an error when there are problems booking the class', function (done) {
    loginStub.yields(null)
    getClubStub.yields(null, 421)
    getClassStub.yields(null, {id: 123, bookingAvailability: 'Available'})
    bookingStub.yields('Simulated booking error')

    vac.process(null, function (err, bookingStatus) {
      err.should.equal('VirginActiveClass.process: Simulated booking error')
      done()
    })
  })

  var states = [{
    testDesc: 'returns "booked" when the booking is successful',
    retState: 'booked' }, {
    testDesc: 'returns "waitingList" when placed on the waitingList',
    retState: 'waitingList' }, {
    testDesc: 'returns "full" when the class is full and cannot be booked',
    vaRetState: 'BOOKED',
    retState: 'full' }]

  states.forEach( function (el) {

    it(el.testDesc, function (done) {

      loginStub.yields(null)
      getClubStub.yields(null, 421)
      getClassStub.yields(null, {id: 123, bookingAvailability: 'Available'})
      bookingStub.yields(null,el.retState)

      vac.process(null, function (err, bookingStatus) {
        bookingStatus.should.equal(el.retState)
        done()
      })
    })

  })

});
