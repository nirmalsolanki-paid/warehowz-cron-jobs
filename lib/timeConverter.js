// const convertSecondsIntoTimeLeft = (timeInSeconds) => {
//     // const maxTime = 259200; //72 hours in seconds
//     // const maxTime = 97200; //27 hours in seconds
//     const maxTime = 7200; //2 hours in seconds
//     if(timeInSeconds > maxTime){
//         return {
//             "h": 0,
//             "m": 0,
//             "s": 0
//         }
//     }
//     const timeLeft = Math.abs(maxTime - timeInSeconds);

//     let hours = Math.floor(timeLeft / (60 * 60));

//     let divisor_for_minutes = timeLeft % (60 * 60);
//     let minutes = Math.floor(divisor_for_minutes / 60);

//     let divisor_for_seconds = divisor_for_minutes % 60;
//     let seconds = Math.ceil(divisor_for_seconds);

//     let obj = {
//         "h": hours,
//         "m": minutes,
//         "s": seconds
//     };
//     return obj;
// }

// module.exports = convertSecondsIntoTimeLeft;

const convertSecondsIntoTimeLeftQuotes = (timeInSeconds) => {
  // const maxTime = 259200; //72 hours in seconds
  // const maxTime = 97200; //27 hours in seconds
  const maxTime = 86400; //24 hours in seconds
  // const maxTime = 7200; //2 hours in seconds
  if (timeInSeconds > maxTime) {
    return {
      h: 24,
      m: 0,
      s: 0
    };
  }
  const timeInQueue = Math.abs(timeInSeconds);

  const hours = Math.floor(timeInQueue / (60 * 60));

  const divisor_for_minutes = timeInQueue % (60 * 60);
  const minutes = Math.floor(divisor_for_minutes / 60);

  const divisor_for_seconds = divisor_for_minutes % 60;
  const seconds = Math.ceil(divisor_for_seconds);

  const obj = {
    h: hours,
    m: minutes,
    s: seconds
  };

  return obj;
};

const convertSecondsIntoTimeLeftProject = (timeInSeconds) => {
  // const maxTime = 259200; //72 hours in seconds
  // const maxTime = 97200; //27 hours in seconds
  // const maxTime = 86400; //24 hours in seconds
  const maxTime = 21600; //6 hours in seconds
  // const maxTime = 7200; //2 hours in seconds
  if (timeInSeconds > maxTime) {
    return {
      h: 0,
      m: 0,
      s: 0
    };
  }
  const timeLeftInQueue = Math.abs(maxTime - timeInSeconds);

  const hours = Math.floor(timeLeftInQueue / (60 * 60));

  const divisor_for_minutes = timeLeftInQueue % (60 * 60);
  const minutes = Math.floor(divisor_for_minutes / 60);

  const divisor_for_seconds = divisor_for_minutes % 60;
  const seconds = Math.ceil(divisor_for_seconds);

  const obj = {
    h: hours,
    m: minutes,
    s: seconds
  };

  return obj;
};

const convertSecondsIntoTimeLeftNonResponsiveStages = (
  timeInSeconds,
  maxTime
) => {
  // const maxTime = 259200; //72 hours in seconds
  // const maxTime = 97200; //27 hours in seconds
  // const maxTime = 86400; //24 hours in seconds
  // const maxTime = 21600; //6 hours in seconds
  // const maxTime = 7200; //2 hours in seconds
  if (timeInSeconds > maxTime) {
    return {
      h: 0,
      m: 0,
      s: 0
    };
  }
  const timeLeftInQueue = Math.abs(maxTime - timeInSeconds);

  const hours = Math.floor(timeLeftInQueue / (60 * 60));

  const divisor_for_minutes = timeLeftInQueue % (60 * 60);
  const minutes = Math.floor(divisor_for_minutes / 60);

  const divisor_for_seconds = divisor_for_minutes % 60;
  const seconds = Math.ceil(divisor_for_seconds);

  const obj = {
    h: hours,
    m: minutes,
    s: seconds
  };

  return obj;
};

const convertSecondsIntoHMS = (timeInSeconds) => {
  const hours = Math.floor(timeInSeconds / (60 * 60));

  const divisor_for_minutes = timeInSeconds % (60 * 60);
  const minutes = Math.floor(divisor_for_minutes / 60);

  const divisor_for_seconds = divisor_for_minutes % 60;
  const seconds = Math.ceil(divisor_for_seconds);

  const obj = {
    h: hours,
    m: minutes,
    s: seconds
  };

  return obj;
};

module.exports = {
  convertSecondsIntoTimeLeftProject,
  convertSecondsIntoTimeLeftQuotes,
  convertSecondsIntoTimeLeftNonResponsiveStages,
  convertSecondsIntoHMS
};
