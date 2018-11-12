# Virgin Active class booker

This script automatically books a gym class at Virgin Active (UK).




## How it works

The script will check your emails for a specific (configured) message. For example, a google calendar reminder telling you to book your yoga class for next Tuesday. It will then log in to the Virgin website, look up the timetable, identify the (configured) class, and book it. It will then send you a report email to tell you if the booking has been successful (or if you've been added to the waiting list or the class was full).

A good way to understand the different actions that happen when the script runs is to run the test packs (see below).

Currently Virgin opens bookings for their class one week in advance at 7am. If you don't wake up that early, there's a chance you won't be able to get a booking by 8am. Hence the script.


### A few notes

- Virgin doesn't provide an API that I'm aware of, so it works by effectively scraping virginactive.co.uk. DO NOT ABUSE THEIR WEBSITE!
- The email functionality only supports gmail. To support anything else you'll have to update https://github.com/nigelsdtech/email-notification.
- The script runs once through and exits. It doesn't persist. Run it from a cronjob for best results.



<br>
<br>

## Setup


### Install the npm package dependencies required by the script

Running this will automatically download all dependencies and create the following directories:
* /path/to/your/app/logs
* /path/to/your/home/directory/.credentials

```sh
$ npm install
```

<br>
<br>

### Setup your credentials

You need to setup a few sets of credentials for the gmail interface functionality.

1. npm install will automatically create a directory will called ~/.credentials. The application will save access tokens here.
2. You need to create ~/.credentials/client_secret.json - this is a client secrets key file you generate using Google's API access pages (https://console.developers.google.com/cloud-resource-manager). See here for more details: https://developers.google.com/api-client-library/python/guide/aaa_client_secrets. You will need to create a Google Access project and they will provide this json file.
2. Generate a Gmail app-specific password for the configs (see here: https://support.google.com/accounts/answer/185833?hl=en).

### Setup your configs

Generally speaking, you need two levels of configs, one general, and multiple instance-specific. For example, let's say you attend two classes a week - abs on Monday at the Wandsworth branch, and yoga on Tuesday at Crouch End. You will need the following config files:

1. One general config (called config/local.json) to contain common information like your VA username and password, your email address, etc.
2. One config specific to the Monday abs class (called config/local-monday_abs.json).
3. One config specific to the Tuesday yoga class (called config/local-tuesday_yoga.json).



<br>
Now add the following to configs/local.json (descriptions of each item are available below):

```js
{

  // Sends out the report email once the script has run
  reporter: {
    appSpecificPassword : 'OVERRIDE_ME',
    emailsFrom          : 'OVERRIDE_ME',
    notificationTo      : 'OVERRIDE_ME',
    user                : 'OVERRIDE_ME'
  }

  // Virgin active login credentials
  va: {
    username: 'OVERRIDE_ME',
    password: 'OVERRIDE_ME'
  },


```

<br>
Descriptions:

| Config item | Description |
| ------ | ------ |
| reporter{} | Contains configs for dealing with the reporter module that emails you with the results of the script run. Uses https://github.com/nigelsdtech/reporter |
| reporter.appSpecificPassword | The gmail app-specific password for the reporter to send emails from your account. See https://support.google.com/accounts/answer/185833?hl=en |
| reporter.emailsFrom | The "from" name when the report email is sent. E.g. "Alex's Raspberry Pi"|
| reporter.notificationTo | The email address to which you want to send the report.|
| reporter.user | Gmail username associated with the appSpecificPassword. |
| va{} | Contains details for interacting with the Virgin Active website. |
| va.username | Login username |
| va.password | Login password. Yes - I get it - you're storing your password in a plaintext file. Gitignore has been configured to not commit any config named local-\*.js\*. |



<br>
<br>
Add the following to configs/local-monday_abs.json and configs/local-tueday_yoga.json:

```js
{

  gmailSearchCriteria: 'OVERRIDE_ME',

  va: {
    classToBook: {
      date: "OVERRIDE_ME",
      name: "OVERRIDE_ME",
      time: "OVERRIDE_ME"
    },
    clubName: 'OVERRIDE_ME'
  }

}

```


<br>
Descriptions:

| Config item | Description |
| ------ | ------ |
| gmailSearchCriteria | Gmail search string when searching for the email notification to trigger the booker. Remember that gmail has smart search operators. Therefore you can do something like this: "is:unread is:inbox subject:\"Notification: Book abs class for next Monday\"" |
| va{} | Extension of the same object seen in local.json |
| va.classToBook{} | Details of the class being booked |
| va.classToBook.date | Start date of the class in yyyy-mm-dd format. Alternatively, it can also be set to the value "one week later" for one week from the current date. Eg. if the script runs on 2018-01-01, it will search for classes on 2018-01-08. |
| va.classToBook.name | Name of the class exactly as per the VA timetable |
| va.classToBook.time | Start time of the class in HH:MM format. Eg "18:45" |
| va.clubName | The name of the club as seen in the URL when you browse the club's calendar online. Eg, the Tower bridge gym's URL is "https://www.virginactive.co.uk/clubs/tower-bridge". Therefore, the clubName is "tower-bridge" |


<br>

The application uses https://github.com/lorenwest/node-config for configuration. Have a look at this page to understand how to set up config files: https://github.com/lorenwest/node-config/wiki/Configuration-Files .



<br>
<br>

### Authorize yourself with Google

The first time you run, you will be required to authorize yourself with google and save a token. Follow the instructions on the screen and you'll be ok. You won't have to do this again.

<br>
<br>

## Run the script


### Basic run

When running the script, you have to add a -i flag with the instance being run. This should be exactly the same as the config filename you setup for the instance. I.e.
* For the Monday abs class, the config name is config/local-monday_abs.json and the instance name is "monday_abs".
* For the Tuesday yoga class, the config name is config/local-tuesday_yoga.json and the instance name is "tuesday_yoga".

```sh
$ npm start -- -i monday_abs
```

or

```sh
$ npm start -- -i tuesday_yoga
```


<br>

### Setup a cronjob

For example, setup a crontab to run at 7am on Mondays and Tuesdays and run the relevant instance.

```sh
00 07 * * 1 cd /path/to/your/installation/node-book-virgin-active-class; npm start -- -i monday_abs   > /dev/null 2>&1
00 07 * * 2 cd /path/to/your/installation/node-book-virgin-active-class; npm start -- -i tuesday_yoga > /dev/null 2>&1
```



## Automated testing


### Basic run

```sh
$ npm test
```

There are two sets of tests, unit tests and functional tests (see scripts/tesh.sh).
* Unit tests exist for each js class and stub out all i/o functions. The idea is to do a quick test and see the functions have no syntax errors.
* The functional tests will actually send out fake trigger emails, read them from your gmail inbox, access a (mocked) VA page, and try various successful/unsuccessful cases to ensure the script behaves in the expected way.

Have a look at config/test.js to figure out how to configure the tests to run. I'd recommend setting your overrides in a file called config/local-test.json
