require("dotenv").config();

if (process.argv.length < 3) {
  console.log("Usage: delete-old-records <base-pid>");
  process.exit(1);
}

const BASE_PID = process.argv[2];
console.log(`Processing records for ${BASE_PID}`);

const base = require("airtable").base(BASE_PID);

base("Visits")
  .select({
    view: "All Events",
    pageSize: 10,
    filterByFormula: `DATETIME_DIFF(NOW(), CREATED_TIME(), 'months') > 6`,
  })
  .eachPage(
    (records, fetchNextPage) => {
      const idsToDelete = [];
      records.forEach((record) => {
        console.log(
          "Retrieved",
          record.id,
          record.get("Pathname"),
          record.get("Date / Time")
        );
        idsToDelete.push(record.id);
      });

      if (idsToDelete.length > 0) {
        base("Visits").destroy(idsToDelete, (err, deletedRecords) => {
          if (err) {
            console.error(err);
            return;
          }
          console.log("Deleted", deletedRecords.length, "records");
        });
      } else {
        console.log(`No old records found`);
      }

      // To fetch the next page of records, call `fetchNextPage`.
      // If there are more records, `page` will get called again.
      // If there are no more records, `done` will get called.
      fetchNextPage();
    },
    (err) => {
      if (err) {
        console.error(err);
        return;
      }
    }
  );
