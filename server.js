const net = require("net");
const fs = require("fs");

const moment = require("moment");
const {v4} = require("uuid");
const sql = require("mysql");

//DATABASE
const DB = sql.createConnection({
  host: "10.7.1.13",
  user: "mfit",
  password: "p@ssw0rd",
  database: "3cx_data"
});

DB.connect(err => {
  if (err) {
    console.log(err);
    return null;
  }

  console.log("Connected to the MYSQL DB");
});

//TEST DATABASE QUERY

// DB.query(`SELECT * FROM logs`, (err, results, field) => {
//   console.log(err);
//   console.log(results);
//   console.log(field);
//
//   let arr = [];
//
//   results.forEach(item => {
//     arr.push(item.cdr);
//   });
//
//   let buff = Buffer.from(arr.join(" "));
//   console.log(arr);
//   console.log(buff.toString());
// });

//SERVER

const connections = [];
let buffer = Buffer.from("");

const server = net.createServer(async connection => {
  try {
    const getAllUnsentToDB = new Promise((resolve, reject) => {
      DB.query(`SELECT * FROM logs WHERE sent = 0`, (err, res, fields) => {
        if (err) {
          reject(err);
          return null;
        }

        let stringArr = [];

        res.forEach(item => {
          stringArr.push(item.cdr);
        });

        resolve(stringArr);
      });
    });

    console.log(
      "Connection made by client! - " +
      moment().format("MMMM Do YYYY, h:mm:ss a")
    );

    const unsentData = await getAllUnsentToDB;

    connection.write(Buffer.from(unsentData.join(" ")));
    console.log(
      "Unsaved data has been sent to the client! - " +
      moment().format("MMMM Do YYYY, h:mm:ss a")
    );

    connections.push(connection);

    connection.on("error", err => {
      console.log(
        "Client has disconnected! - " +
        moment().format("MMMM Do YYYY, h:mm:ss a")
      );
      connection.end();
      connections.pop();
    });
  } catch (e) {
    console.log(e);
  }
});

server.listen(3000, () => {
  console.log(
    "Server listening on 3000 - " + moment().format("MMMM Do YYYY, h:mm:ss a")
  );
});

//CLIENT

//Original
const options = {port: 7000, host: "10.7.8.5"};

//Test
// const options = {port: 4000, host: "localhost"};

const appendFile = data => {
  fs.appendFile("log.txt", data, err => {
    if (err) throw err;
    console.log(
      "The log file has been updated! - " +
      moment().format("MMMM Do YYYY, h:mm:ss a")
    );
  });
};

async function connect() {
  try {
    const connection = new Promise(resolve => {
      let currentConnection = net.createConnection(options, () => {
        console.log(
          "Connected to the server! - " +
          moment().format("MMMM Do YYYY, h:mm:ss a")
        );
        resolve(currentConnection);
      });
    });

    const conn = await connection;
    monitor(conn);
  } catch (e) {
    console.log(e);
  }
}

const monitor = function (client) {
  client.on("data", async data => {
    try {
      // console.log(data);
      appendFile(data.toString());

      // This promise will save all the unsent data to the DB
      // This promise will save all the unsent data to the DB
      const saveUnsentToDB = new Promise((resolve, reject) => {
        DB.query(
          `INSERT INTO logs (id, cdr, sent) VALUES ("${v4()}", "${data.toString()}", 0)`,
          (err, res, fields) => {
            if (err) {
              console.log("The data was not saved!");
              reject(err);
              return null;
            }

            console.log("The unsent data was saved to the DB!");

            resolve(true);
          }
        );
      });

      await saveUnsentToDB;

      if (connections.length === 0) {
        console.log(
          "Client not connected. Data is stored in the database! - " +
          moment().format("MMMM Do YYYY, h:mm:ss a")
        );
      } else {
        //This promise returns an array of the CDR logs that are unsent
        const dbquery = new Promise((resolve, reject) => {
          DB.query(`SELECT * FROM logs WHERE sent = 0`, (err, res, fields) => {
            if (err) {
              reject(err);
              return null;
            }

            let stringArr = [];

            res.forEach(item => {
              stringArr.push(item.cdr);
            });

            resolve(stringArr);
          });
        });

        const unsentData = await dbquery;

        const unsentDataDBBuffer = Buffer.from(unsentData.join(" "));

        buffer = Buffer.concat([buffer, data, unsentDataDBBuffer]);
        console.log(buffer.toString());
        connections.forEach(conn => {
          conn.write(buffer);
          //Query to update all the data that has the status of not sent in the DB
          DB.query(
            `UPDATE logs SET sent = 1 WHERE sent = 0`,
            (err, res, field) => {
              if (err) {
                console.log(err);
                return null;
              }
              console.log(
                "DB Values updated! There are no more unsent records."
              );
            }
          );
          console.log(
            "Data has been sent to JDS" +
            moment().format("MMMM Do YYYY, h:mm:ss a")
          );
        });
        buffer = Buffer.from("");
      }
    } catch (e) {
      console.log(e);
    }
  });
  client.on("error", err => {
    console.log(err);
  });
  client.on("end", () => {
    console.log(
      "Disconnected from server.. Reconnecting... - " +
      moment().format("MMMM Do YYYY, h:mm:ss a")
    );
    connect();
  });
};

connect();
