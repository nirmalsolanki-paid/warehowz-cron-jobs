const path = require('path');
const mongoose = require('mongoose');

const templatesDir = path.join(__dirname, '../emails');
// const templatesDir = path.join(__dirname, '../templates');

const emailTemplates = require('email-templates');
const config = require('../config');

const normalizeCcForLog = (cc) => {
  if (!cc) return '';
  if (typeof cc === 'string') return cc;
  if (Array.isArray(cc)) return cc.filter(Boolean).join(', ');

  try {
    return String(cc);
  } catch (e) {
    return '';
  }
};

const markNotificationError = (Notification, notificationId, error) => {
  Notification.updateOne({ _id: notificationId }, { error: String(error) }, (err) => {
    if (err) console.log(`[EMAIL] notification_log_update_error error=${err}`);
  });
};

const markNotificationSent = (Notification, notificationId) => {
  Notification.updateOne(
    { _id: notificationId },
    { isEmailSent: true, sentAt: new Date() },
    (err) => {
      if (err) console.log(`[EMAIL] notification_log_update_error error=${err}`);
    }
  );
};

const logAndSend = (
  { sendgrid, Notification, emailTemplates, templatesDir },
  { templateName, locals, from, recipient, cc, subject }
) => {
  const notificationId = new mongoose.Types.ObjectId();
  const ccForLog = normalizeCcForLog(cc);

  Notification.create(
    { _id: notificationId, templateName, from, recipient, cc: ccForLog, subject, locals },
    (createErr) => {
      if (createErr) console.log(`[EMAIL] notification_log_error error=${createErr}`);

      emailTemplates(templatesDir, (err, template) => {
        if (err) {
          console.log(
            `[EMAIL] template_load_error template=${templateName} recipient=${recipient} error=${err}`
          );
          markNotificationError(Notification, notificationId, err);

          return;
        }
        template(templateName, locals, (err, html, text) => {
          if (err) {
            console.log(
              `[EMAIL] template_render_error template=${templateName} recipient=${recipient} error=${err}`
            );
            markNotificationError(Notification, notificationId, err);

            return;
          }
          sendgrid.send(
            { to: recipient, cc, from, subject, text, html },
            (err) => {
              if (err) {
                console.log(
                  `[EMAIL] send_error template=${templateName} recipient=${recipient} error=${err}`
                );
                markNotificationError(Notification, notificationId, err);
              } else {
                console.log(`[EMAIL] sent template=${templateName} recipient=${recipient}`);
                markNotificationSent(Notification, notificationId);
              }
            }
          );
        });
      });
    }
  );
};

module.exports = () => {
  const sendgrid = require('sendgrid')(config.email.sendgrid_api_key);
  const Notification = mongoose.model('Notification');

  return {
    sendTemplateEmail: (templateName, locals, recipient, cc, subject) => {
      if (recipient) {
        console.log(
          `[EMAIL] attempt template=${templateName} from=${config.email.sender} recipient=${recipient} cc=${cc} subject=${subject}`
        );
        logAndSend(
          { sendgrid, Notification, emailTemplates, templatesDir },
          { templateName, locals, from: config.email.sender, recipient, cc, subject }
        );
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
        console.log(
          `[EMAIL] no_recipient template=${templateName} subject=${subject}`
        );
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
        console.log(
          `[EMAIL] attempt template=${templateName} from=${sender} recipient=${recipient} cc=${cc} subject=${subject}`
        );
        logAndSend(
          { sendgrid, Notification, emailTemplates, templatesDir },
          { templateName, locals, from: sender, recipient, cc, subject }
        );
      } else {
        console.log(
          `[EMAIL] no_recipient template=${templateName} subject=${subject}`
        );
      }
    },
    sendErrorEmail: function (content) {
      const recipient = 'reya.rajan@covintus.com';
      const from = 'error@covintus.com';

      console.log(
        `[EMAIL] attempt template=error_email from=${from} recipient=${recipient}`
      );
      sendgrid.send(
        {
          to: [recipient],
          from: 'error@covintus.com',
          subject: 'Warehowz - 500 error',
          fromname: 'Warehowz - Error',
          html: content.toString()
        },
        function (err, json) {
          if (err) {
            console.log(
              `[EMAIL] send_error template=error_email recipient=${recipient} error=${err}`
            );
          } else {
            console.log(`[EMAIL] sent template=error_email recipient=${recipient}`);
          }
        }
      );
    }
  };
};
