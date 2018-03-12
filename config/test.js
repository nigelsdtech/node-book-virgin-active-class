var cfg   = require('config');
var defer = require('config/defer').deferConfig;

module.exports = {

  auth: {
    tokenFile: defer( function (cfg) { return 'access_token_'+cfg.appName+ '-test-recipient.json' } ),
  },

  log : {
    level: "FATAL"
  },

  va: {
    clubName: "Fiction Club",
    username: "test_user@fakeEmail.com",
    password: "testPassword",
    classToBook: {
      name: "Core",
      date: "2018-02-08",
      time: "13:05"
    }
  },


  processedLabelName:  'virgin-active-booker-test',


  testEmailSender: {
    subject: "Notification: Book VA Core class for next Tuesday",
    gmail: {
      appSpecificPassword : process.env.PERSONAL_APP_SPECIFIC_PASSWORD,
      clientSecretFile    : defer ( function (cfg) { return cfg.auth.clientSecretFile } ),
      emailsFrom          : defer ( function (cfg) { return cfg.appName + " notification sender" } ),
      googleScopes        : defer ( function (cfg) { return cfg.auth.googleScopes } ),
      name                : 'Trigger sender',
      tokenDir            : defer ( function (cfg) { return cfg.auth.tokenFileDir } ),
      tokenFile           : defer ( function (cfg) { return cfg.auth.tokenFile.replace('-recipient','-sender')} ),
      user                : process.env.PERSONAL_GMAIL_USERNAME
    }
  },

  testEmailRecipient: {
    emailAddress: process.env.PERSONAL_TEST_EMAIL,
    gmail: {
      clientSecretFile : defer ( function (cfg) { return cfg.auth.clientSecretFile } ),
      googleScopes     : defer ( function (cfg) { return cfg.auth.googleScopes } ),
      name             : 'Recipient inbox',
      tokenDir         : defer ( function (cfg) { return cfg.auth.tokenFileDir } ),
      tokenFile        : defer ( function (cfg) { return cfg.auth.tokenFile } )
    }
  },

  gmailSearchCriteria: defer( function (cfg) { return 'is:unread is:inbox subject:"' + cfg.testEmailSender.subject + '"' } ),

  reporter: {
    appName             : defer( function (cfg) { return cfg.appName+'-'+process.env.NODE_ENV } ),
    appSpecificPassword : process.env.PERSONAL_APP_SPECIFIC_PASSWORD,
    emailsFrom          : process.env.PERSONAL_EMAIL_ADDRESS,
    name                : 'Reporter (Personal)',
    notificationTo      : defer( function (cfg) { return cfg.testEmailSender.recipient } ),
    user                : process.env.PERSONAL_GMAIL_USERNAME
  }
}
