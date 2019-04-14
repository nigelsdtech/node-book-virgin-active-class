var cfg               = require('config');
var chai              = require('chai');
var EmailNotification = require('email-notification');
var gmailModel        = require('gmail-model');
var log4js            = require('log4js');
var sinon             = require('sinon');
var Q                 = require('q');
var bvac              = require('../../lib/BookVirginActiveClass.js');
var VAC               = require('../../lib/VirginActiveClass.js');
var reporter          = require('reporter');

/*
 * Set up chai
 */
chai.should();


// Common testing timeout
var timeout = cfg.testTimeout || (20*1000);


  /*
   * Logs
   */
log4js.configure(cfg.log.log4jsConfigs);

var log = log4js.getLogger(cfg.log.appName);
log.setLevel(cfg.log.level);

/*
 * Personal mailbox
 */

var testSenderGmail    = new gmailModel(cfg.testEmailSender.gmail);
var testRecipientGmail = new gmailModel(cfg.testEmailRecipient.gmail);


/*
 * The actual tests
 */

var d = new Date()
var d = d.getTime()
var recipientAddress = cfg.testEmailRecipient.emailAddress.replace('@', '+' + cfg.appName + '-test@')
cfg.reporter.notificationTo = recipientAddress




/**
 * getNewEN
 *
 * @desc Create a new email-notification object
 *
 * @param {object=}  params -
 * @param {string=}  who    - Either "r"ecipient or "s"ender
 * @param {string}   gsc    - Gmail search criteria for the object
 * @param {callback} cb     - The callback that handles the response. cb(err)
 *
 */
function getNewEN (params) {

  var p = {
    gmailSearchCriteria: params.gsc,
    processedLabelName:  cfg.processedLabelName,
    metadataHeaders: ['From', 'To', 'Subject', 'Date'],
    format: 'metadata',
    retFields: ['id', 'labelIds', 'payload(headers)']
  }

  if (params.who == 'r') {
    p.gmail = cfg.testEmailRecipient.gmail
  } else {
    p.gmail = cfg.testEmailSender.gmail
  }

  return new EmailNotification(p)
}



/**
 * Stub used to mock out the lib/VirginActiveClass package.
 */
var vacStub


/**
 * startScript
 *
 * @desc Sends a notification email and triggers the script
 *
 * @param {object=}  params                  - Parameters for request
 * @param {boolean}  params.emailDelay       - Whether or not to create a delay between sending out trigger notifications and starting the script (defaults to true)
 * @param {boolean}  params.sendNotification - Whether or not to send out the initial notification email (defaults to true)
 * @param {string}   params.vacErr           - VirginActiveClass.process returns cb(err, ret). This is the mocked err (defaults to null)
 * @param {string}   params.vacRet           - VirginActiveClass.process returns cb(err, ret). This is the mocked ret (defaults to null)
 * @param {callback} cb                      - The callback that handles the response. cb(err)
 *
 */
function startScript(params, cb) {

  var fn = 'startScript'
  log.info('%s: pre-emptive cleanup', fn)

  var opts = {
    emailDelay: true,
    sendNotification: true,
    vacErr: null,
    vacRet: null
  }

  if (params && params.hasOwnProperty('sendNotification') && params.sendNotification == false) { opts.sendNotification = false }
  if (params && params.hasOwnProperty('vacErr')                                              ) { opts.vacErr           = params.vacErr }
  if (params && params.hasOwnProperty('vacRet')                                              ) { opts.vacRet           = params.vacRet }
  if (params && params.hasOwnProperty('emailDelay')       && params.emailDelay       == false) { opts.emailDelay       = false }

  Q.nfcall(cleanup,null)
  .then( function () {

    if (opts.sendNotification) {

      log.info('%s: send out trigger email', fn)
      var sm = Q.nbind(testSenderGmail.sendMessage, testSenderGmail)

      return Q.nfcall(sm, {
        body    : "Start the VA booker",
        subject : cfg.testEmailSender.subject,
        to      : recipientAddress
      })
    } else {
      log.info('%s: not sending out trigger email', fn)
      return Q.resolve()
    }
  })
  .then( function () {

    // Add an arbitrary delay to allow the email to arrive

    if (opts.emailDelay) {
      var d = Q.defer()
      setTimeout(function () {
        d.resolve()
      } , 3000)
      return d.promise
    } else {
      return Q.resolve()
    }
  })
  .then( function () {

    vacStub = sinon.stub(VAC.prototype, 'process')
    vacStub.yields(opts.vacErr, opts.vacRet)

    log.info('%s: start the script', fn)
    return Q.nfcall(bvac)
  })
  .then( function () {
    // Add an arbitrary delay to allow the report email to arrive
    var d = Q.defer()
    setTimeout(function () {
      d.resolve()
    } ,3000)
    return d.promise
  })
  .done(cb)

}


/**
 * cleanup
 *
 * @desc Cleans up all sent and received emails and the label for the operation
 *
 * @param {object=}  params - Parameters for request (currently no params supported)
 * @param {callback} cb     - The callback that handles the response. cb(err)
 *
 */
function cleanup(params, cb) {

  var fn = 'cleanup'
  var gsc = "to:" + recipientAddress

  var jobs = []


  // Cleanup the report email received by the recipient
  var enRecipient = getNewEN ({who: 'r', gsc: 'is:inbox ' + gsc})

  log.info('%s: recipient: cleaning up...', fn)
  var deferredEr  = Q.defer()
  jobs.push(deferredEr.promise)

  enRecipient.hasBeenReceived(null,function (err, hbr) {
    if (hbr) {
      enRecipient.trash(null,function (err) {
        if (err) { deferredEr.reject(err) }
        log.info('%s: recipient: cleaned.', fn)
        deferredEr.resolve()
      })
    } else {
        log.info('%s: recipient: nothing to clean.', fn)
        deferredEr.resolve()
    }
  })


  // Cleanup the application label in the recipient mailbox
  log.info('%s: recipient: getting label to delete...', fn)
  var deferredLbl  = Q.defer()
  jobs.push(deferredLbl.promise)

  enRecipient.getProcessedLabelId(null,function (err, processedLabelId) {
    testRecipientGmail.deleteLabel ({
      labelId: processedLabelId
    }, function (err) {
      if (err) { deferredLbl.reject(err) };
      log.info('%s: recipient: deleted label.', fn)
      deferredLbl.resolve()
    })
  });



  // Cleanup the report email sent by the sender
  var enSender = getNewEN ({who: 's', gsc: 'in:sent '  + gsc})

  log.info('%s: sender: cleaning up...', fn)
  var deferredEs = Q.defer()
  jobs.push(deferredEs.promise)

  enSender.hasBeenReceived(null,function (err, hbr) {
    if (hbr) {
      enSender.trash(null,function (err) {
        if (err) { deferredEs.reject(err) }
        log.info('%s: sender: cleaned.', fn)
        deferredEs.resolve()
      })
    } else {
        log.info('%s: sender: nothing to clean.', fn)
        deferredEs.resolve()
    }
  })


  // Cleanup the VirginActive stub
  if (vacStub) { vacStub.restore() }

  // Return the callback when all promises have resolved
  Q.allSettled(jobs)
  .catch(function (e) {console.error(e)})
  .fin(cb)
}



describe('When a notification is received and it books the class', function () {

  this.timeout(timeout)

  before( function (done) {
    // Make VA pretend to be successful
    startScript({vacRet: 'booked'} ,done)
  })


  it ('Sends a successful report', function(done) {

    // Get the report email
    var er = getNewEN({who: 'r', gsc: 'is:inbox to:' + recipientAddress + ' (booking status: booked)'})
    er.hasBeenReceived(null, function (err,hbr) {
      chai.expect(err).to.not.exist
      hbr.should.equal(true)
      done()
    })

  })


  it ('Applies labels to the notification', function(done) {

    // Get the notification email
    var er = getNewEN({who: 'r', gsc: 'to:' + recipientAddress + ' (Start the VA booker)'})
    er.allHaveBeenProcessed(null, function (err, ahbp) {
      chai.expect(err).to.not.exist
      ahbp.should.equal(true)
      done()
    })
  })

  after( function (done) {
    cleanup(null,done)
  })
})


describe('When a notification is received and there are problems with virgin', function () {


  this.timeout(timeout)

  var tests = [{
    desc: 'When there is a generic problem with virgin',
    err:  'look out for this error'}, {
    desc: 'When the class is full',
    err:  'booking status: full'} ]


  tests.forEach( function (test) {

    var fn = describe
    if (test.only) { fn = describe.only }

    fn(test.desc, function () {

      before( function (done) {
        // Make VA pretend to bug out
        startScript({vacErr: test.err},done)
      })


      it ('Sends an error report', function(done) {

        // Get the report email
        var er = getNewEN({who: 'r', gsc: 'is:inbox to:' + recipientAddress + ' subject:ERROR (' + test.err + ')'})
        er.hasBeenReceived(null, function (err,hbr) {
          chai.expect(err).to.not.exist
          hbr.should.equal(true)
          done()
        })

      })

      it ('Does not apply labels to the notification', function(done) {

        // Get the notification email
        var er = getNewEN({who: 'r', gsc: 'to:' + recipientAddress + ' (Start the VA booker)'})
        er.allHaveBeenProcessed(null, function (err, ahbp) {
          chai.expect(err).to.not.exist
          ahbp.should.equal(false)
          done()
        })
      })

      after( function (done) {
        cleanup(null,done)
      })
    })
  })

})

describe('When no notification is received', function () {

  this.timeout(timeout)

  var rptStubSCN, rptStubHe

  before( function (done) {
    // Make VA pretend to bug out and stub out the reporter to avoid any kind of emails being sent out (this is a preventitive measure if something goes
    // wrong with this test)
    rptStubSCN = sinon.stub(reporter, 'sendCompletionNotice')
    rptStubHe = sinon.stub(reporter, 'handleError')
    rptStubSCN.yields('reporter.sendCompletionNotice - The code should not have reached here')
    rptStubHe.yields('reporter.handleError - The code should not have reached here')

    startScript({sendNotification: false, vacErr: 'vacErr - The code should not have reached here', emailDelay: 0}, done)
  })

  it ('Does not attempt to contact Virgin', function() {
    vacStub.called.should.equal(false)
  })

  it ('Does not send any kind of report', function(done) {

    // Get the report email
    var er = getNewEN({who: 'r', gsc: 'is:inbox to:' + recipientAddress})
    er.hasBeenReceived(null, function (err,hbr) {
      chai.expect(err).to.not.exist
      hbr.should.equal(false)
      done()
    })

  })

  after( function (done) {
    rptStubSCN.restore()
    rptStubHe.restore()
    cleanup(null,done)
  })

})
