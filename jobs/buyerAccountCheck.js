const mongoose = require('mongoose');
const async = require('async');

module.exports = () => {
  const FindSpaceUser = mongoose.model('FindSpaceUser');
  const Project = mongoose.model('Project');

  return {
    name: 'BuyerAccountCheck',
    rule: '1 */4 * * *',
    run: () =>
      new Promise((resolve) => {
        console.log('****** Scheduler runs every 4 hours ******');
        const state = {};
        const now = Date.now();
        const fourHoursAgo = new Date(now - 4 * 60 * 60 * 1000);
        const fiveHoursAgo = new Date(now - 5 * 60 * 60 * 1000);

        // if the user has created any project specs within 4 hours of account creation
        async.series(
          [
            (cb) => {
              // Narrowed to the 4-5h window instead of the whole collection —
              // this used to fetch every non-deleted user and filter in JS,
              // which grew unbounded and caused heap OOM crashes.
              FindSpaceUser.find({
                delete: false,
                createdAt: { $gt: fiveHoursAgo, $lte: fourHoursAgo }
              })
                .lean()
                .exec((err, users) => {
                  if (err) {
                    cb(err);

                    return;
                  }
                  state.users = users;
                  cb();
                });
            },
            (cb) => {
              if (state.users && state.users.length) {
                state.newerUsers = [];
                state.usersToBeNotified = [];
                async.eachSeries(
                  state.users,
                  (user, callback) => {
                    const userAccountUptimeInSeconds =
                      Date.now() - new Date(user.createdAt).getTime();
                    const userAccountUptimeInHours = (
                      userAccountUptimeInSeconds /
                      1000 /
                      60 /
                      60
                    ).toFixed(2);
                    if (
                      userAccountUptimeInHours >= 4 &&
                      userAccountUptimeInHours < 5
                    ) {
                      state.newerUsers.push(user);
                    }
                    callback();
                  },
                  (err) => {
                    if (err) {
                      cb(err);

                      return;
                    }
                    cb();
                  }
                );
              } else {
                cb();
              }
            },
            (cb) => {
              if (state.newerUsers && state.newerUsers.length) {
                async.eachSeries(
                  state.newerUsers,
                  (user, callback) => {
                    Project.findOne({ findSpaceUserId: user._id }).exec(
                      (err, project) => {
                        if (err) {
                          cb(err);

                          return;
                        }
                        if (project) {
                          callback();
                        } else {
                          state.usersToBeNotified.push(user);
                          callback();
                        }
                      }
                    );
                  },
                  (err) => {
                    if (err) {
                      cb(err);

                      return;
                    }
                    cb();
                  }
                );
              } else {
                cb();
              }
            },
            (cb) => {
              if (state.usersToBeNotified && state.usersToBeNotified.length) {
                async.eachSeries(
                  state.usersToBeNotified,
                  (user, callback) => {
                    if (!user.notifiedAboutProjectCreationAfterFourHours) {
                      // To stop all notifications for end users
                      // sender.sendTemplateEmail(
                      //   'notify_user_about_project_creation_2.0',
                      //   locals,
                      //   user.businessEmail,
                      //   '',
                      //   'Reminder - Create Your Project'
                      // );
                      // updateOne (not .save()) — avoids Mongoose's
                      // full-document dirty-path scan.
                      FindSpaceUser.updateOne(
                        { _id: user._id },
                        {
                          $set: {
                            notifiedAboutProjectCreationAfterFourHours: true
                          }
                        },
                        callback
                      );
                    } else {
                      callback();
                    }
                  },
                  (err) => {
                    if (err) {
                      cb(err);

                      return;
                    }
                    cb();
                  }
                );
              } else {
                cb();
              }
            }
          ],
          (err) => {
            if (err) {
              console.error('[BuyerAccountCheck] step 1 error:', err.message);
            }

            // if the user has requested for quotes within 4 hours of project creation
            async.series(
              [
                (cb) => {
                  // Narrowed to the 4-5h window instead of the whole
                  // collection — this used to fetch every project in the
                  // database and filter in JS, which grew unbounded and
                  // caused heap OOM crashes.
                  Project.find({
                    createdAt: { $gt: fiveHoursAgo, $lte: fourHoursAgo }
                  })
                    .lean()
                    .exec((err, projects) => {
                      if (err) {
                        cb(err);

                        return;
                      }
                      state.projects = projects;
                      cb();
                    });
                },
                (cb) => {
                  if (state.projects && state.projects.length) {
                    state.newerProjects = [];
                    state.projectOwnersToBeNotified = [];
                    async.eachSeries(
                      state.projects,
                      (project, callback) => {
                        const projectUptimeInSeconds =
                          Date.now() - new Date(project.createdAt).getTime();
                        const projectUptimeInHours = (
                          projectUptimeInSeconds /
                          1000 /
                          60 /
                          60
                        ).toFixed(2);
                        if (
                          projectUptimeInHours >= 4 &&
                          projectUptimeInHours < 5
                        ) {
                          state.newerProjects.push(project);
                        }
                        callback();
                      },
                      (err) => {
                        if (err) {
                          cb(err);

                          return;
                        }
                        cb();
                      }
                    );
                  } else {
                    cb();
                  }
                },
                (cb) => {
                  if (state.newerProjects && state.newerProjects.length) {
                    async.eachSeries(
                      state.newerProjects,
                      (project, callback) =>
                        Project.findOne({
                          $and: [
                            { assignedStatus: { $exists: true } },
                            { _id: project._id },
                            { assignedStatus: false },
                            { assignedListings: { $exists: true } },
                            { assignedListings: { $eq: [] } }
                          ]
                        })
                          .populate('findSpaceUserId')
                          .exec((err, project) => {
                            if (err) {
                              cb(err);

                              return;
                            }
                            if (project) {
                              state.projectOwnersToBeNotified.push(project);
                              callback();
                            } else {
                              callback();
                            }
                          }),
                      (err) => {
                        if (err) {
                          cb(err);

                          return;
                        }
                        cb();
                      }
                    );
                  } else {
                    cb();
                  }
                },
                (cb) => {
                  if (
                    state.projectOwnersToBeNotified &&
                    state.projectOwnersToBeNotified.length
                  ) {
                    async.eachSeries(
                      state.projectOwnersToBeNotified,
                      (project, callback) => {
                        if (
                          !project.ownerNotifiedAboutQuoteRequestsAfterFourHours &&
                          project.findSpaceUserId
                        ) {
                          // sender.sendTemplateEmail(
                          //   'notify_user_about_quote_requests_2.0',
                          //   locals,
                          //   project.findSpaceUserId.businessEmail,
                          //   '',
                          //   'Reminder - Request Quotes for Your Warehowz Project'
                          // );
                          // project.ownerNotifiedAboutQuoteRequestsAfterFourHours = true;
                          project.save(callback);
                        } else {
                          callback();
                        }
                      },
                      (err) => {
                        if (err) {
                          cb(err);

                          return;
                        }
                        cb();
                      }
                    );
                  } else {
                    cb();
                  }
                }
              ],
              (err) => {
                if (err) {
                  console.error(
                    '[BuyerAccountCheck] step 2 error:',
                    err.message
                  );
                }

                // if the user has clicked on confirm and contracting (on any of the
                // received quotes) to begin contracting within 4 hours of receiving quotes
                async.series(
                  [
                    (cb) => {
                      Project.find({
                        $and: [
                          { quotes: { $exists: true } },
                          { quotes: { $ne: [] } },
                          { quote_accepted: { $exists: true } },
                          { quote_accepted: null }
                        ]
                      })
                        .populate('quotes findSpaceUserId')
                        .exec((err, projects) => {
                          if (err) {
                            cb(err);

                            return;
                          }
                          state.concernedCandidates = projects;
                          cb();
                        });
                    },
                    (cb) => {
                      if (
                        state.concernedCandidates &&
                        state.concernedCandidates.length
                      ) {
                        state.concernedProjects = [];
                        async.eachSeries(
                          state.concernedCandidates,
                          (project, callback) => {
                            const quoteUptimeInSeconds =
                              project.quotes[0] && !project.quotes[0].delete
                                ? Date.now() -
                                  new Date(
                                    project.quotes[0].createdAt
                                  ).getTime()
                                : 0;
                            const quoteUptimeInHours = (
                              quoteUptimeInSeconds /
                              1000 /
                              60 /
                              60
                            ).toFixed(2);
                            if (
                              quoteUptimeInHours >= 4 &&
                              quoteUptimeInHours < 5
                            ) {
                              state.concernedProjects.push(project);
                            }
                            callback();
                          },
                          (err) => {
                            if (err) {
                              cb(err);

                              return;
                            }
                            cb();
                          }
                        );
                      } else {
                        cb();
                      }
                    },
                    (cb) => {
                      if (
                        state.concernedProjects &&
                        state.concernedProjects.length
                      ) {
                        async.eachSeries(
                          state.concernedProjects,
                          (project, callback) => {
                            if (
                              !project.ownerNotifiedAboutWarehouseSelectionAfterFourHours &&
                              project.findSpaceUserId
                            ) {
                              // sender.sendTemplateEmail(
                              //   'notify_user_about_warehouse_selection_2.0',
                              //   locals,
                              //   project.findSpaceUserId.businessEmail,
                              //   '',
                              //   'Reminder - Your Project ' + project.idNo + ' has Quotes Ready'
                              // );
                              // updateOne (not .save()) — avoids Mongoose's
                              // full-document dirty-path scan.
                              Project.updateOne(
                                { _id: project._id },
                                {
                                  $set: {
                                    ownerNotifiedAboutWarehouseSelectionAfterFourHours: true
                                  }
                                },
                                callback
                              );
                            } else {
                              callback();
                            }
                          },
                          (err) => {
                            if (err) {
                              cb(err);

                              return;
                            }
                            cb();
                          }
                        );
                      } else {
                        cb();
                      }
                    }
                  ],
                  (err) => {
                    if (err) {
                      console.error(
                        '[BuyerAccountCheck] step 3 error:',
                        err.message
                      );
                    }
                    resolve();
                  }
                );
              }
            );
          }
        );
      })
  };
};
