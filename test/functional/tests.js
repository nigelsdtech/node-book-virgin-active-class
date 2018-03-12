var cfg        = require('config');
var chai       = require('chai');
var EmailNotification = require('email-notification');
var gmailModel = require('gmail-model');
var log4js     = require('log4js');
var rewire     = require('rewire');
var sinon      = require('sinon');
var bvac       = rewire('../../lib/BookVirginActiveClass.js');
var Q          = require('q');

/*
 * Set up chai
 */
chai.should();


// Common testing timeout
var timeout = cfg.testTimeout || (60*1000);


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
 * startScript
 *
 * @desc Sends a notification email and triggers the script
 *
 * @param {object=}  params                  - Parameters for request
 * @param {boolean}  params.sendNotification - Whether or not to send out the initial notification email
 * @param {callback} cb                      - The callback that handles the response. cb(err)
 *
 */
function startScript(params, cb) {

  var fn = 'startScript'
  log.info('%s: pre-emptive cleanup', fn)

  var opts = {
    sendNotification: true
  }

  if (params && params.hasOwnProperty('sendNotification') && params.sendNotification == false) { opts.sendNotification = false }

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
    var d = Q.defer()
    setTimeout(function () {
      d.resolve()
    } ,3000)
    return d.promise
  })
  .then( function () {

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
  .fin(cb)

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

  var deferredEr  = Q.defer()
  var deferredEs  = Q.defer()
  var deferredLbl = Q.defer()


  // Cleanup the report email received by the recipient
  var enRecipient = getNewEN ({who: 'r', gsc: 'is:inbox ' + gsc})

  log.info('%s: recipient: cleaning up...', fn)
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
  var enSender    = getNewEN ({who: 's', gsc: 'in:sent '  + gsc})

  log.info('%s: sender: cleaning up...', fn)
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


  // Return the callback when all promises have resolved
  Q.allSettled([ deferredEr.promise, deferredEs.promise, deferredLbl.promise ])
  .catch(function (e) {console.error(e)})
  .fin(function () {cb(null)})
}




describe('When a notification is received and it books the class', function () {

  this.timeout(timeout)

  var vaOld

  before( function (done) {
    // Make VA pretend to be successful
    vaOld = bvac.__get__('VirginActive')
    bvac.__set__('VirginActive', { process: function (p,cb) { cb(null,'booked') } } )

    startScript(null,done)
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
    bvac.__set__('VirginActive', vaOld)
    cleanup(null,done)
  })
})


describe('When a notification is received and there are problems with virgin', function () {


  this.timeout(timeout)

  var vaOld

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
        vaOld = bvac.__get__('VirginActive')
        bvac.__set__('VirginActive', { process: function (p,cb) { cb(test.err) } } )

        startScript(null,done)
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
        bvac.__set__('VirginActive', vaOld)
        cleanup(null,done)
      })
    })
  })

})

describe('When no notification is received', function () {

  this.timeout(timeout)

  var vaOld
  var rptOld

  before( function (done) {
    // Make VA pretend to bug out
    vaOld = bvac.__get__('VirginActive')
    bvac.__set__('VirginActive', { process: function (p,cb) { throw new Error ('The code should not have reached here') } } )

    // Stub out the reporter to avoid any kind of emails being sent out (this is a preventitive measure if something goes
    // wrong with this test)
    bvac.__set__('reporter', {
      sendCompletionNotice: function (p,cb) { throw new Error ('reporter.sendCompletionNotice - The code should not have reached here') },
      handleError:          function (p,cb) { throw new Error ('reporter.handleError - The code should not have reached here') }
    })

    startScript({sendNotification: false},done)
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
    bvac.__set__('VirginActive', vaOld)
    bvac.__set__('reporter', rptOld)
    cleanup(null,done)
  })

})
