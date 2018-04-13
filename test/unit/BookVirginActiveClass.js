var cfg                = require('config');
var chai               = require('chai');
var EmailNotification  = require('email-notification');
var reporter           = require('reporter');
var sinon              = require('sinon');
var VirginActiveClass  = require('../../lib/VirginActiveClass.js');
var bvac               = require('../../lib/BookVirginActiveClass.js');

/*
 * Set up chai
 */
chai.should();


// Common testing timeout
var timeout = cfg.testTimeout || (1*1000);



/*
 * The actual tests
 */


describe('Running the script', function () {

  this.timeout(timeout)

  var tests = {
      'contactVA' : {
        title: 'contact VA',
        stubContainer: VirginActiveClass.prototype,
        stubFn: 'process',
        stubVar: null },
      'emailNotification' : {
        title: 'search for email notification trigger',
        stubContainer: EmailNotification.prototype,
        stubFn: 'allHaveBeenProcessed',
        stubVar: null },
      'getVAClassDetails': {
        title: 'get VA class Details',
        stubContainer: VirginActiveClass.prototype,
        stubFn: 'getVAClassDetails',
        stubVar: null },
      'sendErrRpt': {
        title: 'send an error notice',
        stubContainer: reporter,
        stubFn: 'handleError',
        stubVar: null },
      'sendReport': {
        title: 'send a completion notice',
        stubContainer: reporter,
        stubFn: 'sendCompletionNotice',
        stubVar: null },
      'updateLabels': {
        title: 'update the email label',
        stubContainer: EmailNotification.prototype,
        stubFn: 'updateLabels',
        stubVar: null }}


  /**
   * addNotCalledTests
   *
   * Convenience proc for quickly adding "it" mocha tests to check a stub was not called
   *
   */
  function addNotCalledTests(testsToRun) {

    testsToRun.forEach(function (ttr) {

      for (testCode in tests) {

        if (testCode == ttr) {

          var t = tests[testCode]

          it ("Doesn't attempt to " + t.title, function () {
            t.stubVar.called.should.equal(false)
          })
          return null;
        }
      }

      // If we got this far the specified testToRun doesn't exist
      throw new Error ('Invalid test - ' + ttr)
    })
  }


  /**
   * resetStubs
   *
   * Resets all stubs in the "test" variable above
   *
   */
  function resetStubs () {
    var testCodes = Object.keys(tests)
    testCodes.forEach( function (testCode) {
      var t = tests[testCode]
      if (t.stubVar != null) {
        t.stubVar.reset()
      }
    })
  }

  before( function () {
    // Create all the stubs
    var testCodes = Object.keys(tests)
    testCodes.forEach( function (testCode) {
      var t = tests[testCode]
      t.stubVar = sinon.stub(t.stubContainer, t.stubFn)
    })
  })

  after( function () {
    // Undoes all stubs in the "test" variable above
    var testCodes = Object.keys(tests)
    testCodes.forEach( function (testCode) {
      var t = tests[testCode]
        if (t.stubVar != null) {
        t.stubVar.restore()
      }
    })
  })

  describe('When there is nothing to process', function () {

    before( function (done) {
      resetStubs()
      tests.emailNotification.stubVar.yields(null,true)
      bvac(done)
    })

    it ('Calls the email notification module', function () {
      tests.emailNotification.stubVar.called.should.equal(true)
    })

    addNotCalledTests(['contactVA', 'sendReport' , 'sendErrRpt' , 'updateLabels'])
  })

  describe('When the notification checker bugs out', function () {

    before( function (done) {
      resetStubs()
      tests.emailNotification.stubVar.yields('Simulated error')
      tests.sendErrRpt.stubVar.withArgs({errMsg: "BookVirginAciveClass.js Error checking processing is required: Simulated error"}).yields(null)
      bvac(done)
    })

    addNotCalledTests(["contactVA", "sendReport" , "updateLabels"])

    it('Passes the error to the error reporter', function() {
      tests.sendErrRpt.stubVar.called.should.equal(true)
    })
  })

  describe('When a notification is received', function () {

    var spoofDetails

    function commonReset() {
      resetStubs()
      tests.emailNotification.stubVar.yields(null,false)

      spoofDetails = {
        bookingStatus : 'overrideMe',
        clubName: cfg.va.clubName,
        endTime : 'overrideMe',
        name : cfg.va.classToBook.name,
        startTime : cfg.va.classToBook.date + 'T' + cfg.va.classToBook.time + ':00'
      }

    }

    describe('When there are problems making the booking', function () {

      before( function (done) {
        commonReset()
        tests.contactVA.stubVar.yields('Simulated error')
        tests.sendErrRpt.stubVar.withArgs({errMsg: "BookVirginAciveClass.js Error booking class: Simulated error"}).yields(null)
        bvac(done)
      })

      it('Passes the error to the error reporter', function() {
        tests.sendErrRpt.stubVar.called.should.equal(true)
      })

      addNotCalledTests(["sendReport" , "updateLabels"])
    })

    var classDesc = cfg.va.classToBook.name + ' (' + cfg.va.classToBook.date + 'T' + cfg.va.classToBook.time + ':00)' + ' booking status: '


    describe('When the class is full', function () {
      before( function (done) {
        commonReset()
        tests.contactVA.stubVar.yields(null, 'full')
        spoofDetails.bookingStatus = 'full'
        tests.getVAClassDetails.stubVar.returns(spoofDetails)
        tests.sendErrRpt.stubVar.withArgs({errMsg: classDesc + "full"}).yields(null)
        bvac(done)
      })

      it('Passes the error to the error reporter', function() {
        tests.sendErrRpt.stubVar.called.should.equal(true)
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
          tests.contactVA.stubVar.yields(null, bs.status)
          spoofDetails.bookingStatus = bs.status
          tests.getVAClassDetails.stubVar.returns(spoofDetails)
          tests.sendReport.stubVar.reset()
          tests.sendReport.stubVar.withArgs({body: classDesc + bs.status}).yields(null)
          tests.updateLabels.stubVar.withArgs({applyProcessedLabel: true, markAsRead: true}).yields(null,[])
          bvac(done)
        })


        addNotCalledTests(["sendErrRpt"])

        it("Sends a report saying you are " + bs.status, function() {
          tests.sendReport.stubVar.called.should.equal(true)
        })
        it("Update labels on the email", function() {
          tests.updateLabels.stubVar.called.should.equal(true)
        })
      })
    })


  })
})
