'use strict';

const fs = require('fs'),
    path = require('path'),
    _ = require('lodash'),
    nodemailer = require('nodemailer'),
    configHandler = require('../../configManager/models/configHandler'),
    configConsts = require('../../common/consts').CONFIG,
    logger = require('../../common/logger');
module.exports.sendAggregateReport = async (aggregatedResults, job, emails, reportBenchmark = {}) => {
    const testName = aggregatedResults.test_name;
    const endTime = aggregatedResults.end_time;
    const startTime = aggregatedResults.start_time;
    const testRunTime = timeConversion(endTime - startTime);

    const testInfo = {
        runTime: testRunTime,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        testId: aggregatedResults.test_id,
        revisionId: aggregatedResults.revision_id,
        reportId: aggregatedResults.report_id,
        parallelism: aggregatedResults.parallelism
    };
    if (reportBenchmark.score) {
        testInfo.score = reportBenchmark.score;
    }
    if (reportBenchmark.data) {
        testInfo.benchmark = reportBenchmark.data;
    }

    const htmlBody = generateReportFromTemplate(testName, testInfo, aggregatedResults.grafana_url, aggregatedResults.aggregate);

    async function createMailOptions(configSmtp) {
        return {
            from: configSmtp.from,
            to: [emails].join(','),
            html: htmlBody,
            subject: `Your test results: ${testName}${reportBenchmark.score ? ` with score: ${reportBenchmark.score.toFixed(2)}` : ''}`
        };
    }

    try {
        const configSmtp = await configHandler.getConfigValue(configConsts.SMTP_SERVER);
        const transporter = await createSMTPClient(configSmtp);
        const mailOptions = await createMailOptions(configSmtp);
        const response = await transporter.sendMail(mailOptions);
        transporter.close();
        logger.info(response, `Sent email successfully for testId: ${aggregatedResults.test_id}, reportId: ${aggregatedResults.report_id}`);
    } catch (error) {
        logger.error(error, 'Failed to send email');
    }
};

async function createSMTPClient(configSmtp) {
    var options = {
        port: configSmtp.port,
        host: configSmtp.host,
        connectionTimeout: configSmtp.timeout,
        secure: configSmtp.secure,
        auth: {
            user: configSmtp.username || 'test',
            pass: configSmtp.password || 'test'
        },
        tls: {
            rejectUnauthorized: configSmtp.rejectUnauthCerts
        }
    };

    return nodemailer.createTransport(options);
}

function timeConversion(milliseconds) {
    const seconds = (milliseconds / 1000).toFixed(1);

    const minutes = (milliseconds / (1000 * 60)).toFixed(1);

    const hours = (milliseconds / (1000 * 60 * 60)).toFixed(1);

    const days = (milliseconds / (1000 * 60 * 60 * 24)).toFixed(1);

    if (seconds < 60) {
        return seconds + ' Sec';
    } else if (minutes < 60) {
        return minutes + ' Min';
    } else if (hours < 24) {
        return hours + ' Hrs';
    } else {
        return days + ' Days';
    }
}

function generateReportFromTemplate(testName, testInfo, grafanaUrl, aggregatedResults) {
    let codesSummary = [];
    Object.keys(aggregatedResults.codes).forEach((code) => {
        codesSummary.push(`${code}: ${aggregatedResults.codes[code]}`);
    });
    codesSummary = codesSummary.join(', ');

    let errorsSummary = [];
    Object.keys(aggregatedResults.errors).forEach((error) => {
        errorsSummary.push(`${error}: ${aggregatedResults.errors[error]}`);
    });
    errorsSummary = errorsSummary.join(', ');

    const emailVars = { testName, testInfo, grafanaUrl, aggregatedResults, codesSummary, errorsSummary };

    const templateFn = path.join(
        path.dirname(__filename),
        './templates/email_report.html');
    const template = fs.readFileSync(templateFn, 'utf-8');
    const compiledTemplate = _.template(template);
    const html = compiledTemplate(emailVars);
    return html;
}
