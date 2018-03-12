var cfg        = require('config');
var chai       = require('chai');
var dateformat = require('dateformat');
var fs         = require('fs');
var nock       = require('nock');
var rewire     = require('rewire');
var va         = rewire('../../lib/VirginActive.js');

/*
 * Set up chai
 */
chai.should();


// Common testing timeout
var timeout = cfg.testTimeout || (5*1000);

var vaHost = va.__get__('_cfg.va.baseUrl')



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
 * @param {function} params.fn         - The function being tested
 * @param {object}   params.nockObj    - An object containing the nock stub. Have to do it this way so we're passing an object reference to this proc and can change its value in real time
 * @param {object}   params.nockObj.fn - The nock stub
 * @param {boolean}  params.only       - True if you only want to run this scenario
 *
 */
function testUnexpectedResponses(params) {

  var descFn = describe
  if (params.only) { descFn = describe.only }

  descFn(params.describe, function () {
    it('returns an error if the connection times out', function (done) {

      params.nockObj.fn
      .socketDelay(20000)
      .reply(200,'some bad body')

      params.fn(null, function (e, form) {
        e.code.should.equal('ESOCKETTIMEDOUT');
        done();
      })
    });

    it('returns an error if the page is not as expected', function (done) {

      params.nockObj.fn
      .reply(503,'some bad body')

      params.fn(null, function (e, form) {
        e.should.equal(params.errMsg);
        done();
      })
    });
  });
}



/*
 * The actual tests
 */


describe('VirginActive.doLogin', function () {

  this.timeout(timeout)

  // This is an object so its real-time value can be passed to downstream functions
  var nockGetForm = {}
  var privateFn = va.__get__('doLogin');
  var self = this

  beforeEach (function () {
    nockGetForm.fn = nock(vaHost).get('/login')
  })

  afterEach (function () {
    nock.cleanAll()
  })


  testUnexpectedResponses({
    describe: 'Problems getting the login form',
    errMsg: 'VirginActive.doLogin: login form is not as expected',
    fn: privateFn,
    nockObj: nockGetForm
  })


  describe('Getting the login form successfully', function () {

    var loginForm = fs.readFileSync('./test/data/login_form.html')
    var nockSubmitForm = {}

    beforeEach (function () {
      nockGetForm.fn
      .reply(200,loginForm)

      nockSubmitForm.fn = nock(vaHost).post('/login')
    })

    afterEach (function () {
      nock.cleanAll()
    })


    testUnexpectedResponses({
      describe: 'Problems submitting the login form',
      errMsg: 'Login response not as expected.',
      fn: privateFn,
      nockObj: nockSubmitForm
    })


    it('returns a successful login', function (done) {

      // Get a sample of a "good" login page
      nockSubmitForm.fn
      .reply(200, 'generic response', {
        'Set-Cookie': ['.ASPXAUTH=abcdefg; path=/; HttpOnly', '_user=abcdefg']
      })

      privateFn(null, function (e) {
        chai.expect(e).to.not.exist
        done();
      })

    });
  });
});


describe('VirginActive.getDate', function () {

  var privateFn = va.__get__('getDate');

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
      var d = privateFn({
        date: t.date,
        time: t.time
      })

      d.should.equal(t.output)
    })
  })


})




describe('VirginActive.bookClass', function () {

  this.timeout(timeout)

  var nockGetTimetable = {}
  var privateFn = va.__get__('bookClass');

  beforeEach (function () {
    nockGetTimetable.fn = nock(vaHost)
    .get('/clubs/fiction-club/timetable')
  })

  afterEach (function () {
    nock.cleanAll()
  })


  testUnexpectedResponses({
    describe: 'Problems getting the timetable',
    errMsg: 'Timetable not as expected.',
    fn: privateFn,
    nockObj: nockGetTimetable
  })



  describe('Getting the timetable successfully', function () {

    var loginForm = fs.readFileSync('./test/data/sample_timetable.html')
    var nockSubmitBooking = {}

    beforeEach (function () {
      nockGetTimetable.fn
      .reply(200,loginForm)

      nockSubmitBooking.fn = nock(vaHost)
      .get('/api/sitecore/VaClub/ViewTimetableBook')
      .query(true)
    })

    afterEach (function () {
      nock.cleanAll()
    })


    testUnexpectedResponses({
      describe: 'Problems making the booking',
      errMsg: 'Unknown booking status: ',
      fn: privateFn,
      nockObj: nockSubmitBooking
    })


    var states = [{
      dataFile: 'sample_successful_booking.html',
      retState: 'booked' }, {

      dataFile: 'sample_waiting_list_booking.html',
      retState: 'waitingList' }]

    states.forEach( function (el) {

      var itFn = it
      if (el.only) { itFn = it.only }

      itFn('returns the ' + el.retState + ' response when appropriate', function (done) {

        // Get a sample of a successful booking
        var bookingResponse = fs.readFileSync('./test/data/'+el.dataFile)

        nockSubmitBooking.fn
        .reply(200, bookingResponse)

        privateFn(null, function (e,retState) {
          retState.should.equal(el.retState)
          done();
        })
      });
    })

    it('bails out early when the class is full', function (done) {

      var cfgRestore = cfg.va.classToBook

      cfg.va.classToBook = {
        name: 'Yoga - Hatha',
        date: '2018-02-04',
        time: '16:00'
      };

      privateFn(null, function (e,retState) {
        retState.should.equal('full')
        cfg.va.classToBook = cfgRestore
        done();
      })
    });

    it('returns an error if the class is not found', function (done) {

      var cfgRestore = cfg.va.classToBook

      cfg.va.classToBook = {
        name: 'Non-existent class',
        date: '2018-02-04',
        time: '16:00:00'
      };

      privateFn(null, function (e,retState) {
        e.should.equal('notFound')
        cfg.va.classToBook = cfgRestore
        done();
      })
    })

  });
});



describe('VirginActive.process', function () {

  this.timeout(timeout)

  var restoreLogin, restoreBooking

  beforeEach ( function () {
    restoreLogin = va.__set__('doLogin', function (p,cb) { cb(null) });
  })

  afterEach ( function () {
    restoreLogin()
    restoreBooking()
  })

  it('returns an error when there are problems logging in', function () {

    restoreLogin   = va.__set__('doLogin',   function (p,cb) { cb('Simulated error') });
    restoreBooking = va.__set__('bookClass', function (p,cb) { throw new Error('Should not reach here') });

    va.process(null, function (err, bookingStatus) {
      err.should.equal('VirginActive.process: Could not log in: Simulated error')
    })

  })


  it('returns an error when there are problems booking class', function () {

    restoreBooking = va.__set__('bookClass', function (p,cb) { cb('Simulated error') });

    va.process(null, function (err, bookingStatus) {
      err.should.equal('Simulated error')
    })

  })

  var states = [{
    testDesc: 'returns "booked" when the booking is successful',
    retState: 'booked' }, {
    testDesc: 'returns "waitingList" when placed on the waitingList',
    retState: 'waitingList' }, {
    testDesc: 'returns "full" when the class is full and cannot be booked',
    retState: 'full' }]

  states.forEach( function (el) {

    //it(el.testDesc, function () {
    it(el.testDesc, function () {
   
      restoreBooking = va.__set__('bookClass', function (p,cb) { cb(null,el.retState) });
   
      va.process(null, function (err, bookingStatus) {
        bookingStatus.should.equal(el.retState)
      })
    })

  })

});
