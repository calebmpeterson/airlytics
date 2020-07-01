require("./utils/initialize");
const _ = require("lodash");

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
};

function preflight(callback) {
  return {
    statusCode: 204,
    headers: {
      ...CORS,
    },
    body: JSON.stringify({}),
  };
}

async function captureEvent({ pid, pathname, country }) {
  return new Promise((resolve, reject) => {
    const base = require("airtable").base(pid);

    base("Visits").create(
      [
        {
          fields: {
            Pathname: pathname,
            "Date / Time": new Date(),
            Country: country,
          },
        },
      ],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

exports.handler = async (event, context, callback) => {
  console.log(`Environment: ${process.env.NODE_ENV}`);

  if (event.httpMethod === "OPTIONS") {
    console.log(`Preflight`);
    return preflight();
  } else {
    console.log(`Request ${event.httpMethod}`, event);
    const referrer = _.get(event, ["headers", "referer"]);
    const country = _.get(event, ["headers", "x-country"], "");
    try {
      const { pathname } = new URL(referrer);
      const { pid } = event.queryStringParameters;

      console.log(`Capture Event`, { pid, referrer, country });

      await captureEvent({ pid, pathname, country });

      return {
        statusCode: 200,
        headers: {
          ...CORS,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ success: true }),
      };
    } catch (e) {
      console.error(e);
      return {
        statusCode: 500,
        headers: {
          ...CORS,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(e.message),
      };
    }
  }
};
