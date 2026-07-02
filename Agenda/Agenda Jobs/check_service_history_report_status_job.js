'use strict';

const axios = require('axios');
const mongoose = require('mongoose');

const ServiceHistoryReportsModel = require('../../Models/serviceHistoryReportsModel');
const CONSTANTS = require('../../Utils/constants');
const { sendPushToExternalId } = require('../../Helper Functions/send_notification_helpers');
const { processServiceHistoryReportFiles } = require('../../Helper Functions/service_history_report_files_helper');

const carvaidyaGetServiceHistoryReportUrl = process.env.CARVAIDYA_GET_SERVICE_HISTORY_REPORT_URL;

module.exports = (agenda) => {

  agenda.define(
    CONSTANTS.AGENDA_JOBS.CHECK_SERVICE_HISTORY_REPORT_STATUS,
    { priority: 'high', concurrency: 10, lockLifetime: 120_000 },
    async (job, done) => {

      try {

        const data = job.attrs.data || {};

        const {
          requestId,
          licenseNumber,
          registrationNumber,
          make,
          model,
          userId,
          reportDocId,
          attempt = 0
        } = data;

        if (!requestId || !mongoose.isValidObjectId(reportDocId)) {
          return done(new Error('Invalid requestId or reportDocId'));
        }

        // stop after 4 attempts
        if (attempt >= 4) {

          console.log(`[SERVICE_HISTORY_JOB] Max attempts reached | requestId=${requestId}`);

          await agenda.cancel({
            name: CONSTANTS.AGENDA_JOBS.CHECK_SERVICE_HISTORY_REPORT_STATUS,
            'data.requestId': requestId.toString()
          });

          return done();
        }

        // ================= HIT CARVAIDYA REPORT API =================
        const formData = new URLSearchParams();

        formData.append('RequestID', requestId);
        formData.append('LicenseNumber', licenseNumber);

        const response = await axios.post(
          carvaidyaGetServiceHistoryReportUrl,
          formData,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 30000
          }
        );

        const resData = response?.data;

        // Extract CarVaidya's actual inner wrapper
        const carvaidyaBody = resData?.data;

        if (
          response.status === 200 &&
          carvaidyaBody?.code === "true" &&
          carvaidyaBody?.data?.length > 0
        ) {

          const reportData = carvaidyaBody.data[0];

          const serviceHistoryStatus = reportData.serviceHistoryStatus;
          const reportURL = reportData.reportURL;

          // ================= IF REPORT READY =================
          if (serviceHistoryStatus === "Completed" && reportURL) {

            await ServiceHistoryReportsModel.findByIdAndUpdate(
              reportDocId,
              {
                status: "Completed",
                carVaidyaPdfReportUrl: reportURL,
                carVaidyaApiResponse: resData
              }
            );

            // cancel job
            await agenda.cancel({
              name: CONSTANTS.AGENDA_JOBS.CHECK_SERVICE_HISTORY_REPORT_STATUS,
              'data.requestId': requestId.toString()
            });

            // send notification
            try {
              await sendPushToExternalId({
                externalId: userId,
                title: 'Service History Ready',
                body: `Service history report for ${make} ${model} (${registrationNumber}) is ready.`,
                data: { requestId }
              });
            } catch (pushErr) {
              console.error(
                `[SERVICE_HISTORY_JOB] Push notification failed | requestId=${requestId}`,
                pushErr
              );
            }

            // process files
            try {
              const fileProcessResult = await processServiceHistoryReportFiles({
                reportPageUrl: reportURL,
                registrationNumber,
                requestId,
                make,
                model,
                serviceHistoryDocId: reportDocId.toString()
              });

              console.log(
                `[SERVICE_HISTORY_JOB] File processing result | requestId=${requestId} | success=${fileProcessResult?.success} | message=${fileProcessResult?.message}`
              );

              if (!fileProcessResult?.success) {
                console.error(
                  `[SERVICE_HISTORY_JOB] File processing failed | requestId=${requestId} | errors=${JSON.stringify(fileProcessResult?.errors || [])}`
                );
              }
            } catch (fileErr) {
              console.error(
                `[SERVICE_HISTORY_JOB] File processing crashed | requestId=${requestId}`,
                fileErr
              );
            }

            return done();
          }

        }

        // ================= NOT READY YET =================

        job.attrs.data.attempt = attempt + 1;
        await job.save();

        console.log(
          `[SERVICE_HISTORY_JOB] Pending | requestId=${requestId} | attempt=${attempt + 1}`
        );

        return done();

      } catch (err) {

        console.error("[SERVICE_HISTORY_JOB] Error:", err);
        return done(err);

      }
    }
  );
};


/**
 * ================= HELPER: SCHEDULE JOB =================
 */

module.exports.scheduleCheckServiceHistoryReportStatusJob =
  async function scheduleCheckServiceHistoryReportStatusJob(
    agenda,
    {
      requestId,
      licenseNumber,
      registrationNumber,
      make,
      model,
      userId,
      reportDocId
    }
  ) {

    const payload = {
      requestId: requestId.toString(),
      licenseNumber,
      registrationNumber,
      make,
      model,
      userId,
      reportDocId,
      attempt: 0
    };

    const job = agenda.create(
      CONSTANTS.AGENDA_JOBS.CHECK_SERVICE_HISTORY_REPORT_STATUS,
      payload
    );

    job.unique({
      name: CONSTANTS.AGENDA_JOBS.CHECK_SERVICE_HISTORY_REPORT_STATUS,
      'data.requestId': requestId.toString()
    });

    /**
     * Run every working hour
     * Monday - Saturday
     * 11 AM - 6 PM IST
     */
    job.repeatEvery('0 11-18 * * 1-6', {
      timezone: 'Asia/Kolkata'
    });

    await job.save();

    return job;
  };