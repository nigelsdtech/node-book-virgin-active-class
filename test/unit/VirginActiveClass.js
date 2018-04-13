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

var vaHost = 'https://www.virginactive.co.uk'



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
    it('returns an error if the connection times out', function (done) {

      params.nockObj.fn
      .socketDelay(20000)
      .reply(200,'some bad body')

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
    date : 'one week later',
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
    nockGetForm.fn = nock(vaHost).get('/login')
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

      nockSubmitForm.fn = nock(vaHost).post('/login')
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

      // Get a sample of a "good" login page
      nockSubmitForm.fn
      .reply(200, 'generic response', {
        'Set-Cookie': ['.ASPXAUTH=abcdefg; path=/; HttpOnly', '_user=abcdefg']
      })

      vac.doLogin(null, function (e) {
        chai.expect(e).to.not.exist
        done();
      })

    });
  });
});


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

  this.timeout(timeout)

  var vac = getNewVAC({
    date:'2018-02-08',
    name:'Core',
    time:'13:05'
  });
  var nockGetTimetable = {}

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
    vacObj: vac,
    vacFn: 'bookClass',
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
      vacObj: vac,
      vacFn: 'bookClass',
      nockObj: nockSubmitBooking
    })


    var states = [{
      dataFile: 'sample_successful_booking.html',
      name: 'Core',
      date: '2018-02-05',
      time: '18:35',
      retState: 'booked' }, {

      dataFile: 'sample_waiting_list_booking.html',
      name: 'Row',
      date: '2018-02-08',
      time: '12:30',
      retState: 'waitingList' }]

    states.forEach( function (el) {

      var itFn = it
      if (el.only) { itFn = it.only }

      itFn('returns the ' + el.retState + ' response when appropriate', function (done) {

        // Get a sample of a successful booking
        var bookingResponse = fs.readFileSync('./test/data/'+el.dataFile)

        var vac2 = getNewVAC({name: el.name, date: el.date, time: el.time})
        nockSubmitBooking.fn
        .reply(200, bookingResponse)

        vac2.bookClass(null, function (e,retState) {
          retState.should.equal(el.retState)
          done();
        })
      });
    })

    it('bails out early when you\'re already booked', function (done) {

      var cfgRestore = cfg.va.classToBook

      var vac2 = getNewVAC({
        name: 'Strength - Power Yoga',
        date: '2018-02-08',
        time: '18:00'
      });

      vac2.bookClass(null, function (e,retState) {
        retState.should.equal('booked')
        cfg.va.classToBook = cfgRestore
        done();
      })
    });

    it('bails out early when the class is full', function (done) {

      var cfgRestore = cfg.va.classToBook

      var vac2 = getNewVAC({
        name: 'Yoga - Hatha',
        date: '2018-02-04',
        time: '16:00'
      });

      vac2.bookClass(null, function (e,retState) {
        retState.should.equal('full')
        cfg.va.classToBook = cfgRestore
        done();
      })
    });

    it('returns an error if the class is not found', function (done) {

      var cfgRestore = cfg.va.classToBook

      var vac2 = getNewVAC({
        name: 'Non-existent class',
        date: '2018-02-04',
        time: '16:00:00'
      });

      vac2.bookClass(null, function (e,retState) {
        e.should.equal('notFound')
        cfg.va.classToBook = cfgRestore
        done();
      })
    })

  });
});



describe('VirginActiveClass.process', function () {

  this.timeout(timeout)
  var vac, loginStub, bookingStub

  beforeEach ( function () {
    vac = getNewVAC()
    loginStub   = sinon.stub(vac, 'doLogin')
    bookingStub = sinon.stub(vac, 'bookClass')
  })

  afterEach ( function () {
    loginStub.reset()
    bookingStub.reset()
    vac = {}
  })

  it('returns an error when there are problems logging in', function () {

    loginStub.yields('Simulated error')

    vac.process(null, function (err, bookingStatus) {
      err.should.equal('VirginActiveClass.process: Could not log in: Simulated error')
      bookingStub.called.should.equal(false)
    })

  })


  it('returns an error when there are problems booking class', function () {

    loginStub.yields(null)
    bookingStub.yields('Simulated error')

    vac.process(null, function (err, bookingStatus) {
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

    it(el.testDesc, function () {

      loginStub.yields(null)
      bookingStub.yields(null,el.retState)

      vac.process(null, function (err, bookingStatus) {
        bookingStatus.should.equal(el.retState)
      })
    })

  })

});
