const mongoose = require('mongoose');
const moment = require('moment');

module.exports = () => {
  const Project = mongoose.model('Project');
  const Invoice = mongoose.model('Invoice');

  return {
    name: 'ProjectExpiry',
    rule: '0 6 * * *',
    run: async () => {
      // for every week - cron  - 0 0 * * 0
      console.log('* * * * * Closing Inactive Projects * * * * * ');
      try {
        //1st condition of expired projects [new] (contract date aka project date got exceeded)
        const activeProjectsBeyondEndDate = await Project.find({
          status: 'Active',
          toDate: { $lte: new Date() }
        }).exec();
        const today = new Date();
        const before120Days = new Date(
          new Date().setDate(today.getDate() - 120)
        );
        const potentiallyExpiredProjects = [];
        for (let i = 0; i < activeProjectsBeyondEndDate.length; i++) {
          const id = activeProjectsBeyondEndDate[i]._id;
          const invoices = await Invoice.find({
            project: mongoose.Types.ObjectId(id)
          })
            .sort({ createdAt: -1 })
            .exec();
          if (invoices.length) {
            const latestInvoice = invoices[0];
            //2nd condition of expired projects [new] (ideal in terms of invoices for 4 months)
            if (moment(latestInvoice.createdAt).isBefore(before120Days)) {
              potentiallyExpiredProjects.push(id.toString());
            }
          } else {
            // No invoice since it became active and it's been 4 months
            if (
              moment(activeProjectsBeyondEndDate[i].updatedAt).isBefore(
                before120Days
              )
            ) {
              potentiallyExpiredProjects.push(id.toString());
            }
          }
        }

        for (let k = 0; k < potentiallyExpiredProjects.length; k++) {
          await Project.updateOne(
            { _id: mongoose.Types.ObjectId(potentiallyExpiredProjects[k]) },
            { $set: { status: 'Expired', closedAsInactiveProject: true } }
          ).exec();
        }
      } catch (error) {
        console.log(error);
      }
    }
  };
};
