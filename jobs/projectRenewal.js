const mongoose = require('mongoose');
const moment = require('moment');

module.exports = (ctx) => {
  const { config, sender } = ctx;
  const project = mongoose.model('Project');

  return {
    name: 'ProjectRenewal',
    run: async () => {
      try {
        console.log('***** Checking project renew *****');
        const firstDate = moment().add(30, 'days');
        const secondDate = moment().add(60, 'days');
        const thirdDate = moment().add(90, 'days');
        const firstCondtion = {
          toDate: {
            $gte: moment(moment(firstDate).startOf('date')).utc(true),
            $lte: moment(moment(firstDate).endOf('date')).utc(true)
          }
        };
        const secondCondition = {
          toDate: {
            $gte: moment(moment(secondDate).startOf('date')).utc(true),
            $lte: moment(moment(secondDate).endOf('date')).utc(true)
          }
        };
        const thirdCondition = {
          toDate: {
            $gte: moment(moment(thirdDate).startOf('date')).utc(true),
            $lte: moment(moment(thirdDate).endOf('date')).utc(true)
          }
        };

        const findCriteria = {
          status: 'Active',
          'renew.renewed': { $ne: true },
          $or: [firstCondtion, secondCondition, thirdCondition]
        };
        const projectList = await project
          .find(findCriteria, { idNo: 1, toDate: 1 })
          .populate({
            path: 'findSpaceUserId',
            select: ['firstName', 'lastName', 'businessEmail']
          })
          .populate({
            path: 'listSpaceUserId',
            select: ['firstName', 'lastName', 'businessEmail']
          });
        if (projectList.length > 0) {
          projectList.forEach((item) => {
            const diffDays = moment(item.toDate).diff(moment(), 'days');
            const detailsHowzer = {
              toc: config.url + '/toc',
              privacy: config.url + '/privacy',
              name:
                item.listSpaceUserId.firstName +
                ' ' +
                item.listSpaceUserId.lastName,
              url: config.url + `/provider/project-renew/${item._id}`,
              idNo: item.idNo,
              endDate: item.toDate,
              days: diffDays
            };
            const detailsDepozitor = {
              toc: config.url + '/toc',
              privacy: config.url + '/privacy',
              name:
                item.findSpaceUserId.firstName +
                ' ' +
                item.findSpaceUserId.lastName,
              url: config.url + `/buyer/project-renew/${item._id}`,
              idNo: item.idNo,
              endDate: item.toDate,
              days: diffDays
            };
            sender.sendTemplateEmail(
              'renew-email',
              detailsHowzer,
              item.listSpaceUserId.businessEmail,
              '',
              'Contract Renewal'
            );
            sender.sendTemplateEmail(
              'renew-email',
              detailsDepozitor,
              item.findSpaceUserId.businessEmail,
              '',
              'Contract Renewal'
            );
          });
        }
      } catch (err) {
        console.error('[ProjectRenewal] error:', err.message);
      }
    }
  };
};
