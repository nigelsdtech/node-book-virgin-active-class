var cfg                = require('config'),
    EmailNotification  = require('email-notification'),
    log4js             = require('log4js'),
    Q                  = require('q'),
    reporter           = require('reporter'),
    VirginActiveClass  = require('./VirginActiveClass.js');



/*
* Book a class at Virgin Active as it becomes available
*
*/


module.exports = function (programComplete) {

  /*
   * Initialize
   */


  /*
   * Logs
   */
  log4js.configure(cfg.log.log4jsConfigs);

  var log = log4js.getLogger(cfg.log.appName);
  log.setLevel(cfg.log.level);


  /*
   * Job reporter
   */
  reporter.configure(cfg.reporter);



  // Create the email notification object
  var en = new EmailNotification({
    gmailSearchCriteria: cfg.gmailSearchCriteria,
    processedLabelName: cfg.processedLabelName,
    format: 'minimal',
    retFields: ['id', 'labelIds'],
    gmail: {
      clientSecretFile : cfg.auth.clientSecretFile,
      googleScopes     : cfg.auth.googleScopes,
      name             : 'VA search',
      tokenDir         : cfg.auth.tokenFileDir,
      tokenFile        : cfg.auth.tokenFile
    }
  });



  /*
   * Main program
   */


  log.info('Begin script');
  log.info('============');




  log.info('Checking processing is required...')
  log.info('Search: ' + cfg.gmailSearchCriteria)

  var errMsg = 'BookVirginAciveClass.js Error checking processing is required: '
  var ahbp = Q.nbind(en.allHaveBeenProcessed, en)

  var vac

  Q.nfcall(ahbp, null)
  .then (function (allHaveBeenProcessed) {

    if (allHaveBeenProcessed) {
      log.info('Processing isn\'t required.')
      return Q.resolve(false);
    }

    return Q.resolve(true);

  })
  .then (function (contactVA) {

    if (!contactVA) { return Q.resolve ('noBookingNeeded') }

    log.info('Processing is required. Calling Virgin Active...')

    errMsg = 'BookVirginAciveClass.js Error booking class: '

    vac = new VirginActiveClass({
      clubName : cfg.va.clubName,
      date : cfg.va.classToBook.date,
      name : cfg.va.classToBook.name,
      password : cfg.va.password,
      time : cfg.va.classToBook.time,
      username : cfg.va.username,
    })

    var processCall = Q.nbind(vac.process, vac)

    return Q.nfcall(processCall, null)

  })
  .then (function (bookingStatus) {

    if (bookingStatus == 'noBookingNeeded') { return Q(false) }

    var cd = vac.getVAClassDetails()
    log.debug(cd)

    var msg = cd.name + ' (' + cd.startTime + ')' + ' booking status: ' + bookingStatus
    log.info(msg)

    switch(bookingStatus) {
      case 'booked':
      case 'waitingList':


        var deferredRpt = Q.defer()
        var deferredLbl = Q.defer()

        log.info('Sending completion notice...')
        log.info(msg)
        reporter.sendCompletionNotice({
          body: msg
        }, function (err, cb) {
          if (err) {return deferredRpt.reject(err)}
          log.info('Sent completion notice.')
          deferredRpt.resolve(null)
        })


        log.info('Updating email labels...')
        en.updateLabels({
          applyProcessedLabel: true,
          markAsRead: true
        }, function (err, cb) {
          if (err) {return deferredLbl.reject(err)}
          log.info('Updated email labels.')
          deferredLbl.resolve(null)
        })


        return Q.all([deferredRpt.promise, deferredLbl.promise])

        break;
      case 'full':
        errMsg = msg
        return Q.reject()
        break;
      default :
        errMsg = 'Unknown booking status: ' + bookingStatus
        return Q.reject(errMsg)
        break;
    }


  })
  .catch(function (e) {

    if (e) errMsg += e

    var deferredErr = Q.defer()

    log.error(errMsg)

    reporter.handleError({
      errMsg: errMsg
    }, function (err) {
      if (err) {
        log.error('Failed to send error report: ' + err)
        deferredErr.reject(null)
      } else {
        log.info('Sent error notice.')
      }
      deferredErr.resolve(null)
    })

    return deferredErr.promise
  })
  .fin(function () {
    log.info('Ending program.')
    programComplete()
  })

}
