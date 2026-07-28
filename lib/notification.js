const path = require('path');
const mongoose = require('mongoose');

const templatesDir = path.join(__dirname, '../emails');
// const templatesDir = path.join(__dirname, '../templates');

const emailTemplates = require('email-templates');
const config = require('../config');

module.exports = () => {
  const sendgrid = require('sendgrid')(config.email.sendgrid_api_key);

  return {
    sendTemplateEmail: (templateName, locals, recipient, cc, subject) => {
      if (recipient) {
        emailTemplates(templatesDir, (err, template) => {
          if (err) {
            console.log(err + '1');

            return;
          }
          template(templateName, locals, (err, html, text) => {
            if (err) {
              console.log(err + '2');

              return;
            } else {
              sendgrid.send(
                {
                  to: recipient,
                  cc: cc,
                  from: config.email.sender,
                  subject: subject,
                  text: text,
                  html: html
                },
                function (err, json) {
                  if (err) {
                    console.log(err);
                  } else {
                    console.log(
                      "Email to '" + recipient + "' successfully sent."
                    );
                  }
                }
              );
            }
          });
        });
        // const emailTemplate = new emailTemplates({
        //     message: {
        //         from: 'niftylettuce@gmail.com'
        //     },
        //     // uncomment below to send emails in development/test env:
        //     // send: true,
        //     transport: {
        //         jsonTransport: true
        //     },
        //     views: {
        //         options: {
        //             extension: 'ejs'
        //         }
        //     }
        // });
        // emailTemplate.render(templateName + '/html', locals)
        //     .then((html) => {
        //         // console.log(html);
        //         // let imageb64 = "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";
        //         sendgrid.send({
        //             to: recipient,
        //             from: config.email.sender,
        //             subject: subject,
        //             html: html
        //         }, function (err, json) {
        //             if (err) {
        //                 console.log(err);
        //             } else {
        //                 console.log("Email to '" + recipient + "' successfully sent.");
        //             }
        //         });

        //         // sgMail.send({
        //         //     to: recipient,
        //         //     from: config.email.sender,
        //         //     subject: subject,
        //         //     // text: text,
        //         //     html: html

        //         // });
        //     })
        //     .catch(console.error);
      } else {
        console.log('No email recipient to send or Email Disabled');
      }
    },

    sendUserMailManager: (
      templateName,
      locals,
      sender,
      recipient,
      cc,
      subject
    ) => {
      if (recipient) {
        emailTemplates(templatesDir, (err, template) => {
          if (err) {
            console.log(err + '1');

            return;
          }
          template(templateName, locals, (err, html, text) => {
            if (err) {
              console.log(err + '2');

              return;
            } else {
              sendgrid.send(
                {
                  to: recipient,
                  cc: cc,
                  from: sender,
                  subject: subject,
                  text: text,
                  html: html
                },
                function (err, json) {
                  if (err) {
                    console.log(err);
                  } else {
                    console.log(
                      "Email to '" + recipient + "' successfully sent."
                    );
                  }
                }
              );
            }
          });
        });
      } else {
        console.log('No email recipient to send or Email Disabled');
      }
    },
    sendErrorEmail: function (content) {
      sendgrid.send(
        {
          to: ['reya.rajan@covintus.com'],
          from: 'error@covintus.com',
          subject: 'Warehowz - 500 error',
          fromname: 'Warehowz - Error',
          html: content.toString()
        },
        function (err, json) {
          if (err) {
            console.log(err);
          } else {
            console.log('Email to reya.rajan@covintus.com successfully sent.');
          }
        }
      );
    }
  };
};
