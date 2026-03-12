const fs = require("fs");

// -------------------- Helper Functions --------------------
function parse12HourTime(timeStr) {
    let parts = timeStr.trim().toLowerCase().split(" ");
    let timePart = parts[0];
    let period = parts[1];

    let timePieces = timePart.split(":");
    let hours = Number(timePieces[0]);
    let minutes = Number(timePieces[1]);
    let seconds = Number(timePieces[2]);

    if (period === "am" && hours === 12) {
        hours = 0;
    } else if (period === "pm" && hours !== 12) {
        hours += 12;
    }

    return hours * 3600 + minutes * 60 + seconds;
}

function parseDuration(durationStr) {
    let parts = durationStr.trim().split(":");
    let hours = Number(parts[0]);
    let minutes = Number(parts[1]);
    let seconds = Number(parts[2]);

    return hours * 3600 + minutes * 60 + seconds;
}

function formatDuration(totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;

    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;

    let mm = minutes < 10 ? "0" + minutes : "" + minutes;
    let ss = seconds < 10 ? "0" + seconds : "" + seconds;

    return hours + ":" + mm + ":" + ss;
}

function isEidPeriod(date) {
    return date >= "2025-04-10" && date <= "2025-04-30";
}

function readLines(filePath) {
    let content = fs.readFileSync(filePath, "utf8");
    if (content.trim() === "") return [];
    return content.trim().split("\n");
}

function parseShiftLine(line) {
    let parts = line.split(",");
    return {
        driverID: parts[0],
        driverName: parts[1],
        date: parts[2],
        startTime: parts[3],
        endTime: parts[4],
        shiftDuration: parts[5],
        idleTime: parts[6],
        activeTime: parts[7],
        metQuota: parts[8] === "true",
        hasBonus: parts[9] === "true"
    };
}

function shiftObjToLine(obj) {
    return [
        obj.driverID,
        obj.driverName,
        obj.date,
        obj.startTime,
        obj.endTime,
        obj.shiftDuration,
        obj.idleTime,
        obj.activeTime,
        obj.metQuota,
        obj.hasBonus
    ].join(",");
}

function getDayName(dateStr) {
    let days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let d = new Date(dateStr);
    return days[d.getDay()];
}

// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
    let startSeconds = parse12HourTime(startTime);
    let endSeconds = parse12HourTime(endTime);
    return formatDuration(endSeconds - startSeconds);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    let startSeconds = parse12HourTime(startTime);
    let endSeconds = parse12HourTime(endTime);

    let deliveryStart = parse12HourTime("8:00:00 am");
    let deliveryEnd = parse12HourTime("10:00:00 pm");

    let idle = 0;

    if (startSeconds < deliveryStart) {
        idle += Math.min(endSeconds, deliveryStart) - startSeconds;
    }

    if (endSeconds > deliveryEnd) {
        idle += endSeconds - Math.max(startSeconds, deliveryEnd);
    }

    return formatDuration(idle);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    let shiftSeconds = parseDuration(shiftDuration);
    let idleSeconds = parseDuration(idleTime);
    return formatDuration(shiftSeconds - idleSeconds);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
    let activeSeconds = parseDuration(activeTime);
    let requiredSeconds;

    if (isEidPeriod(date)) {
        requiredSeconds = 6 * 3600;
    } else {
        requiredSeconds = 8 * 3600 + 24 * 60;
    }

    return activeSeconds >= requiredSeconds;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    let lines = readLines(textFile);
    let records = [];

    for (let i = 0; i < lines.length; i++) {
        records.push(parseShiftLine(lines[i]));
    }

    for (let i = 0; i < records.length; i++) {
        if (records[i].driverID === shiftObj.driverID && records[i].date === shiftObj.date) {
            return {};
        }
    }

    let shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    let idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    let activeTime = getActiveTime(shiftDuration, idleTime);
    let quotaMet = metQuota(shiftObj.date, activeTime);

    let newRecord = {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration: shiftDuration,
        idleTime: idleTime,
        activeTime: activeTime,
        metQuota: quotaMet,
        hasBonus: false
    };

    let insertIndex = -1;
    for (let i = 0; i < records.length; i++) {
        if (records[i].driverID === shiftObj.driverID) {
            insertIndex = i;
        }
    }

    if (insertIndex === -1) {
        records.push(newRecord);
    } else {
        records.splice(insertIndex + 1, 0, newRecord);
    }

    let updatedLines = [];
    for (let i = 0; i < records.length; i++) {
        updatedLines.push(shiftObjToLine(records[i]));
    }

    fs.writeFileSync(textFile, updatedLines.join("\n"));
    return newRecord;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    let lines = readLines(textFile);
    let updatedLines = [];

    for (let i = 0; i < lines.length; i++) {
        let record = parseShiftLine(lines[i]);

        if (record.driverID === driverID && record.date === date) {
            record.hasBonus = newValue;
        }

        updatedLines.push(shiftObjToLine(record));
    }

    fs.writeFileSync(textFile, updatedLines.join("\n"));
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    let lines = readLines(textFile);
    let count = 0;
    let foundDriver = false;
    let targetMonth = Number(month);

    for (let i = 0; i < lines.length; i++) {
        let record = parseShiftLine(lines[i]);

        if (record.driverID === driverID) {
            foundDriver = true;
            let recordMonth = Number(record.date.split("-")[1]);

            if (recordMonth === targetMonth && record.hasBonus === true) {
                count++;
            }
        }
    }

    if (!foundDriver) return -1;
    return count;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    let lines = readLines(textFile);
    let totalSeconds = 0;

    for (let i = 0; i < lines.length; i++) {
        let record = parseShiftLine(lines[i]);
        let recordMonth = Number(record.date.split("-")[1]);

        if (record.driverID === driverID && recordMonth === Number(month)) {
            totalSeconds += parseDuration(record.activeTime);
        }
    }

    return formatDuration(totalSeconds);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    let shiftLines = readLines(textFile);
    let rateLines = readLines(rateFile);

    let dayOff = "";

    for (let i = 0; i < rateLines.length; i++) {
        let parts = rateLines[i].split(",");
        if (parts[0] === driverID) {
            dayOff = parts[1];
            break;
        }
    }

    let totalSeconds = 0;

    for (let i = 0; i < shiftLines.length; i++) {
        let record = parseShiftLine(shiftLines[i]);
        let recordMonth = Number(record.date.split("-")[1]);

        if (record.driverID === driverID && recordMonth === Number(month)) {
            let currentDayName = getDayName(record.date);

            if (currentDayName !== dayOff) {
                if (isEidPeriod(record.date)) {
                    totalSeconds += 6 * 3600;
                } else {
                    totalSeconds += 8 * 3600 + 24 * 60;
                }
            }
        }
    }

    totalSeconds -= bonusCount * 2 * 3600;

    if (totalSeconds < 0) totalSeconds = 0;

    return formatDuration(totalSeconds);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    let rateLines = readLines(rateFile);

    let basePay = 0;
    let tier = 0;

    for (let i = 0; i < rateLines.length; i++) {
        let parts = rateLines[i].split(",");
        if (parts[0] === driverID) {
            basePay = Number(parts[2]);
            tier = Number(parts[3]);
            break;
        }
    }

    let actualSeconds = parseDuration(actualHours);
    let requiredSeconds = parseDuration(requiredHours);

    if (actualSeconds >= requiredSeconds) {
        return basePay;
    }

    let missingSeconds = requiredSeconds - actualSeconds;
    let missingHours = Math.floor(missingSeconds / 3600);

    let allowedMissing = 0;
    if (tier === 1) allowedMissing = 50;
    else if (tier === 2) allowedMissing = 20;
    else if (tier === 3) allowedMissing = 10;
    else if (tier === 4) allowedMissing = 3;

    let billableMissingHours = missingHours - allowedMissing;
    if (billableMissingHours < 0) {
        billableMissingHours = 0;
    }

    let deductionRatePerHour = Math.floor(basePay / 185);
    let salaryDeduction = billableMissingHours * deductionRatePerHour;
    let netPay = basePay - salaryDeduction;

    return netPay;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
