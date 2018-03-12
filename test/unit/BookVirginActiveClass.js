var cfg                = require('config');
var chai               = require('chai');
var EmailNotification  = require('email-notification');
var rewire             = require('rewire');
var reporter           = require('reporter');
var sinon              = require('sinon');
var va                 = require('../../lib/VirginActive.js');
var bvac               = rewire('../../lib/BookVirginActiveClass.js');

/*
 * Set up chai
 */
chai.should();


// Common testing timeout
var timeout = cfg.testTimeout || (5*1000);



/*
 * The actual tests
 */


describe('Running the script', function () {

  this.timeout(timeout)

  var enStub      = sinon.stub(EmailNotification.prototype, 'allHaveBeenProcessed')
  var enLabelStub = sinon.stub(EmailNotification.prototype, 'updateLabels')
  var vaStub      = sinon.stub(va,                          'process')
  var rptStub     = sinon.stub(reporter,                    'sendCompletionNotice')
  var errRptStub  = sinon.stub(reporter,                    'handleError')

  var tests = [{
      code: "contactVA",
      title: "contact VA",
      stub: vaStub }, {

      code: "sendReport",
      title: "send a completion notice",
      stub: rptStub }, {

      code: "sendErrRpt",
      title: "send an error notice",
      stub: errRptStub }, {

      code: "updateLabels",
      title: "update the email label",
      stub: enLabelStub }]

  function addNotCalledTests(testsToRun) {

    tests.forEach(function (test) {
      for (var i = 0; i < testsToRun.length; i++) {
        if (testsToRun[i] == test.code ) {
          it ("Doesn't attempt to " + test.title, function () {
            test.stub.called.should.equal(false)
          })
          break;
        }
      }
    })

  }

  function resetStubs () {

    tests.forEach( function (test) {
      test.stub.reset()
      test.stub.throws(test.code + ' - Error needs override')
    })

  }


  describe('When there is nothing to process', function () {

    before( function (done) {
      resetStubs()
      enStub.yields(null,true)
      bvac(done)
    })

    it ("Calls the email notification module", function () {
      enStub.called.should.equal(true)
    })

    addNotCalledTests(["contactVa", "sendReport" , "sendErrRpt" , "updateLabels"])
  })

  describe('When the notification checker bugs out', function () {

    before( function (done) {
      resetStubs()
      enStub.yields('Simulated error')
      errRptStub.withArgs({errMsg: "BookVirginAciveClass.js Error checking processing is required: Simulated error"}).yields(null)
      bvac(done)
    })

    addNotCalledTests(["contactVa", "sendReport" , "updateLabels"])

    it('Passes the error to the error reporter', function() {
      errRptStub.called.should.equal(true)
    })
  })

  describe('When a notification is received', function () {

    function commonReset() {
      resetStubs()
      enStub.yields(null,false)
      vaStub.reset()
    }

    describe('When there are problems making the booking', function () {

      before( function (done) {
        commonReset()
        vaStub.yields('Simulated error')
        errRptStub.withArgs({errMsg: "BookVirginAciveClass.js Error booking class: Simulated error"}).yields(null)
        bvac(done)
      })

      it('Passes the error to the error reporter', function() {
        errRptStub.called.should.equal(true)
      })

      addNotCalledTests(["sendReport" , "updateLabels"])
    })

    var classDesc = cfg.va.classToBook.name + ' (' + cfg.va.classToBook.date + ' ' + cfg.va.classToBook.time + ')' + ' booking status: '


    describe('When the class is full', function () {
      before( function (done) {
        commonReset()
        vaStub.yields(null, 'full')
        errRptStub.withArgs({errMsg: classDesc + "full"}).yields(null)
        bvac(done)
      })

      it('Passes the error to the error reporter', function() {
        errRptStub.called.should.equal(true)
      })

      addNotCalledTests(["sendReport" , "updateLabels"])
    })


    var bookingStatuses = [{
      desc: "When you're put on the waiting list",
      status: "waitingList"} , {

      desc: "When you're booked in the class",
      status: "booked"}]


    bookingStatuses.forEach( function (bs) {

      describe(bs.desc, function () {

        before( function (done) {
          commonReset()
          vaStub.yields(null, bs.status)
          console.log('Expecting to call with ' + classDesc + bs.status)
          rptStub.reset()
          rptStub.withArgs({body: classDesc + bs.status}).yields(null)
          enLabelStub.withArgs({applyProcessedLabel: true, markAsRead: true}).yields(null,[])
          bvac(done)
        })


        addNotCalledTests(["sendErrRpt"])

        it("Sends a report saying you are " + bs.status, function() {
          rptStub.called.should.equal(true)
        })
        it("Update labels on the email", function() {
          enLabelStub.called.should.equal(true)
        })
      })
    })


  })
})
