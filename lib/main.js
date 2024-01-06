
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();
const port = 3001;
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'spc_calculations',
  password: 'admin',
  port: 5432,
});

app.use(cors());
app.use(express.json());

async function calculateAndStoreMR() {
  const client = await pool.connect();

  try {
    await client.query(`
    UPDATE values_measurement
    SET MR = CAST(ABS(value - tprev.prevalue) AS NUMERIC(10, 2))
    FROM (
      SELECT timestamp, LAG(value) OVER (ORDER BY timestamp) as prevalue
      FROM values_measurement
    ) tprev
    WHERE values_measurement.timestamp = tprev.timestamp;
  `);
  

  } finally {
    client.release();
  }
}

async function calculateAndInsertRanges2() {
  const client = await pool.connect();

  try {
    await client.query('DELETE FROM range_chart2');
    // Create a temporary table with paired values
    await client.query(`
      CREATE TEMPORARY TABLE PairedValues AS (
        SELECT
          timestamp,
          value AS first_value,
          LEAD(value) OVER (ORDER BY timestamp) AS second_value
        FROM
          values_measurement
      );
    `);

    // Insert calculated ranges into range_chart2
    await client.query(`
      INSERT INTO range_chart2 (id, range)
      SELECT
        ROW_NUMBER() OVER () AS id,
        ABS(COALESCE(second_value, 0) - first_value) AS range
      FROM
        PairedValues
      WHERE
        timestamp % 2 = 1;
    `);
  } finally {
    client.release();
  }
}




async function calculateAndInsertRanges3() {
  const client = await pool.connect();

  try {
    await client.query('DELETE FROM range_chart3');
    // Execute the first CTE to get grouped values
    await client.query(`
      WITH numbered_values AS (
        SELECT
          value,
          ROW_NUMBER() OVER () AS row_num
        FROM values_measurement
      )
      -- Insert grouped values into range_chart3
      INSERT INTO range_chart3 (first, second, third)
      SELECT
        nv1.value AS first,
        nv2.value AS second,
        nv3.value AS third
      FROM
        numbered_values nv1
      JOIN
        numbered_values nv2 ON nv1.row_num + 1 = nv2.row_num
      JOIN
        numbered_values nv3 ON nv1.row_num + 2 = nv3.row_num
      WHERE
        (nv1.row_num - 1) % 3 = 0;
    `);

    // Execute the second CTE to update range_chart3 with min, max, and range values
    await client.query(`
      -- Update range_chart3 with min, max, and range values
      UPDATE range_chart3
      SET
        min_value = LEAST(first, second, third),
        max_value = GREATEST(first, second, third),
        range = GREATEST(first, second, third) - LEAST(first, second, third);
    `);
  } finally {
    client.release();
  }
}

// Retrieve data
app.get('/data', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM values_measurement');
    const results = { 'results': (result) ? result.rows : null };
    res.json(results);
    client.release();
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

app.all('/calculate', async (req, res) => {
  try {
  const { selectedOption } = req.body;
  console.log(req.body);
  console.log('Selected Option:', selectedOption);

  if (selectedOption === '1') {
          console.log('Calculating for option 1');
          await calculateAndStoreMR();
          // Calculate xbar, sd for the 'value' column in values_measurement table
          const result = await pool.query('SELECT AVG(value) AS xbar, STDDEV(value) AS sd FROM values_measurement');
    
          // Extract xbar, sd from the result
          const xbar = result.rows[0].xbar.toFixed(2);
          const sd = result.rows[0].sd.toFixed(2);
    
          // Insert xbar, sd into the spc_result table
          await pool.query('INSERT INTO spc_result (xbar, sd) VALUES ($1, $2)', [xbar, sd]);
    
          await pool.query('UPDATE spc_result SET usl = 525, lsl = 475');

          // Calculate pp
          const ppResult = await pool.query('SELECT (usl - lsl) / (6 * sd) AS pp FROM spc_result');
          const pp = ppResult.rows[0].pp.toFixed(2);
    
          // Update pp in the spc_result table
          await pool.query('UPDATE spc_result SET pp = $1', [pp]);
    
          // Calculate PPU
          const ppuResult = await pool.query('SELECT ((usl - xbar) / (3 * sd))::numeric::decimal(10, 2) AS ppu FROM spc_result');
          const ppu = ppuResult.rows[0].ppu;
    
          // Update PPU in the spc_result table
          await pool.query('UPDATE spc_result SET PPU = $1', [ppu]);
    
          // Calculate PPL
          const pplResult = await pool.query('SELECT ((xbar - lsl) / (3 * sd))::numeric::decimal(10, 2) AS ppl FROM spc_result');
          const ppl = pplResult.rows[0].ppl;
    
          // Update PPL in the spc_result table
          await pool.query('UPDATE spc_result SET PPL = $1', [ppl]);
    
          // Calculate Ppk
          const ppkResult = await pool.query('SELECT LEAST((usl - xbar) / (3 * sd), (xbar - lsl) / (3 * sd))::numeric::decimal(10, 2) AS ppk FROM spc_result');
          const ppk = ppkResult.rows[0].ppk;
    
          // Update Ppk in the spc_result table
          await pool.query('UPDATE spc_result SET Ppk = $1', [ppk]);
    
          // Calculate RBAR
          const rbarResult = await pool.query('SELECT SUM(MR) / COUNT(CASE WHEN MR >= 0 THEN 1 ELSE NULL END) AS Rbar FROM values_measurement');
          const rbar = rbarResult.rows[0].rbar.toFixed(2);
          console.log(rbar);

    
          // Update RBAR in the spc_result table
          await pool.query('UPDATE spc_result SET RBAR = $1', [rbar]);
    
          // Calculate SDW
          const sdwResult = await pool.query('SELECT (RBAR / 1.128) AS SDW FROM spc_result');
          const sdw = sdwResult.rows[0].sdw.toFixed(2);

          // Update SDW in the spc_result table
          await pool.query('UPDATE spc_result SET SDW = $1', [sdw]);

          // Calculate CP
          const cpResult = await pool.query('SELECT (usl - lsl) / (6 * sd) AS cp FROM spc_result');
          const cp = cpResult.rows[0].cp.toFixed(2);
    
          // Update CP in the spc_result table
          await pool.query('UPDATE spc_result SET CP = $1', [cp]);
    
          // Calculate CPU
          const cpuResult = await pool.query('SELECT ((usl - xbar) / (3 * sdw))::numeric::decimal(10, 2) AS cpu FROM spc_result');
          const cpu = cpuResult.rows[0].cpu;
    
          // Update CPU in the spc_result table
          await pool.query('UPDATE spc_result SET CPU = $1', [cpu]);
    
          // Calculate CPL
          const cplResult = await pool.query('SELECT ((xbar - lsl) / (3 * sdw))::numeric::decimal(10, 3) AS cpl FROM spc_result');
          const cpl = cplResult.rows[0].cpl;
    
          // Update CPL in the spc_result table
          await pool.query('UPDATE spc_result SET CPL = $1', [cpl]);
    
          // Calculate CPK
          const cpkResult = await pool.query('SELECT LEAST(cpu, cpl)::numeric::decimal(10, 2) AS cpk FROM spc_result');
          const cpk = cpkResult.rows[0].cpk;
    
          // Update CPK in the spc_result table
          await pool.query('UPDATE spc_result SET CPK = $1', [cpk]);
    
          // Calculate UCL
          const uclResult = await pool.query('SELECT (xbar + ((SELECT A2 FROM standardsample WHERE sample_size = 1) * rbar))::numeric::decimal(10, 2) AS ucl FROM spc_result');
          const ucl = uclResult.rows[0].ucl;
    
          // Update UCL in the spc_result table
          await pool.query('UPDATE spc_result SET UCL = $1', [ucl]);
    
          // Calculate LCL
          const lclResult = await pool.query('SELECT (xbar - ((SELECT A2 FROM standardsample WHERE sample_size = 1) * rbar))::numeric::decimal(10, 2) AS lcl FROM spc_result');
          const lcl = lclResult.rows[0].lcl;
    
          // Update LCL in the spc_result table
          await pool.query('UPDATE spc_result SET LCL = $1', [lcl]);
    
          // Send a response
          res.json({ xbar, sd, pp, ppu, ppl, ppk, rbar, sdw, cp, cpu, cpl, cpk, ucl, lcl });
        } 
    else if (selectedOption === '2') {
      console.log('Calculating for option 2');
      await calculateAndInsertRanges2();
      await pool.query('UPDATE spc_result2 SET usl = 525, lsl = 475');

      // Calculate xbar, sd for the 'value' column in values_measurement table
      const result = await pool.query(`
      SELECT
        AVG(value)::numeric::decimal(10, 2) AS xbar,
        STDDEV(value)::numeric::decimal(10, 2) AS sd
      FROM
        values_measurement
    `);

      const { xbar, sd } = result.rows[0];

      // Insert xbar, sd into the spc_result table
     await pool.query('INSERT INTO spc_result2 (xbar, sd) VALUES ($1, $2)', [xbar, sd]);

      // Ca lculate pp
      const ppResult = await pool.query('SELECT ((usl - lsl) / (6 * sd))::numeric::decimal(10, 2) AS pp FROM spc_result');
      const pp = ppResult.rows[0].pp;

      // Update pp in the spc_result table
      await pool.query('UPDATE spc_result SET pp = $1', [pp]);

      // Calculate PPU
      const ppuResult = await pool.query('SELECT ((usl - xbar) / (3 * sd))::numeric::decimal(10, 2) AS ppu FROM spc_result');
      const ppu = ppuResult.rows[0].ppu;

      // Update PPU in the spc_result table
      await pool.query('UPDATE spc_result SET PPU = $1', [ppu]);

     // Calculate PPL
     const pplResult = await pool.query('SELECT ((xbar - lsl) / (3 * sd))::numeric::decimal(10, 2) AS ppl FROM spc_result2');
     const ppl = pplResult.rows[0].ppl;

     // Update PPL in the spc_result table
     await pool.query('UPDATE spc_result SET PPL = $1', [ppl]);

     // Calculate Ppk
     const ppkResult = await pool.query('SELECT LEAST((usl - xbar) / (3 * sd), (xbar - lsl) / (3 * sd))::numeric::decimal(10, 2) AS ppk FROM spc_result');
     const ppk = ppkResult.rows[0].ppk;

     // Update Ppk in the spc_result table
     await pool.query('UPDATE spc_result SET Ppk = $1', [ppk]);

      // Calculate RBAR
    const rangeResult = await pool.query('SELECT (SUM(range) / COUNT(range))::numeric::decimal(10, 2) AS result FROM range_chart2');
    const rbar = rangeResult.rows[0].result;

    // Update RBAR in the spc_result2 table
    await pool.query('UPDATE spc_result2 SET RBAR = $1', [rbar]);
    await pool.query('UPDATE range_chart2 SET RBAR = $1', [rbar]);

    // Calculate SDW using rbar from range_chart2
    const sdwResult = await pool.query(`
      SELECT (rbar / 1.128)::numeric::decimal(10, 2) AS result
      FROM range_chart2
    `);
    const sdw = sdwResult.rows[0].result;

    // Update SDW in the spc_result2 table
    await pool.query('UPDATE spc_result2 SET SDW = $1', [sdw]);
    await pool.query('UPDATE range_chart2 SET SDW = $1', [sdw]);

    // Calculate CP
    const cpResult = await pool.query('SELECT ((525 - 475) / (6 * sdw))::numeric::decimal(10, 2) AS result FROM range_chart2');
    const cp = cpResult.rows[0].result;

    // Update CP in the spc_result2 table
    await pool.query('UPDATE spc_result2 SET CP = $1', [cp]);
    await pool.query('UPDATE range_chart2 SET CP = $1', [cp]);

    // Calculate CPU
    const cpuResult = await pool.query('SELECT ((525 - (SELECT xbar FROM spc_result2 LIMIT 1)) / (3 * (SELECT sdw FROM range_chart2 LIMIT 1)))::numeric::decimal(10, 2) AS result');
    const cpu = cpuResult.rows[0].result;

    // Update CPU in the spc_result2 table
    await pool.query('UPDATE spc_result2 SET CPU = $1', [cpu]);
    await pool.query('UPDATE range_chart2 SET CPU = $1', [cpu]);

    // Calculate CPL
    const cplResult = await pool.query(`
      SELECT ((SELECT xbar FROM spc_result2 LIMIT 1) - 475) / (3 * (SELECT sdw FROM range_chart2 LIMIT 1))AS result
    `);
    const cpl = cplResult.rows[0].result.toFixed(2);

    // Update CPL in the spc_result2 table
    await pool.query('UPDATE spc_result2 SET CPL = $1', [cpl]);
    await pool.query('UPDATE range_chart2 SET CPL = $1', [cpl]);

    // Calculate CPK as the minimum of CPU and CPL
    const cpkResult = await pool.query(`
      SELECT
        LEAST(
          (SELECT cpu FROM range_chart2 LIMIT 1),
          (SELECT cpl FROM range_chart2 LIMIT 1)
        )::numeric::decimal(10, 2) AS cpk
    `);
    const cpk = cpkResult.rows[0].cpk;

    // Update CPK in the range_chart2 table
    await pool.query('UPDATE range_chart2 SET cpk = $1', [cpk]);
    
    // Calculate UCL
    const uclResult = await pool.query(`
      SELECT
        (SELECT xbar FROM spc_result2 LIMIT 1) +
        ((1.88) * (SELECT rbar FROM range_chart2 LIMIT 1))::numeric::decimal(10, 2) AS result
    `);
    const ucl = uclResult.rows[0].result;

    // Calculate LCL
    const lclResult = await pool.query(`
      SELECT
        (SELECT xbar FROM spc_result2 LIMIT 1) -
        ((1.88) * (SELECT rbar FROM range_chart2 LIMIT 1))::numeric::decimal(10, 2) AS result
    `);
    const lcl = lclResult.rows[0].result.toFixed(2);

    // Update UCL and LCL in the spc_result2 table
    await pool.query('UPDATE spc_result2 SET ucl = $1, lcl = $2', [ucl, lcl]);

        // For option 2
        res.json({ xbar, sd , pp , ppu , ppl , ppk , rbar , sdw , cp , cpu ,cpl , cpk,ucl,lcl});

        }



        else if (selectedOption === '3') { 
          console.log('Calculating for option 3');
          await calculateAndInsertRanges3();

          // Calculate xbar, sd for the 'value' column in values_measurement table
          const result = await pool.query('SELECT AVG(value) AS xbar, STDDEV(value) AS sd FROM values_measurement');
    
         
          // Extract xbar, sd from the result
          const xbar = result.rows[0].xbar.toFixed(2);
          const sd = result.rows[0].sd.toFixed(2);
    
          // Insert xbar, sd into the spc_result table
          await pool.query('INSERT INTO spc_result (xbar, sd) VALUES ($1, $2)', [xbar, sd]);
    
          await pool.query('UPDATE spc_result SET usl = 525, lsl = 475');

          // Calculate pp
          const ppResult = await pool.query('SELECT (usl - lsl) / (6 * sd) AS pp FROM spc_result');
          const pp = ppResult.rows[0].pp.toFixed(2);
    
          // Update pp in the spc_result table
          await pool.query('UPDATE spc_result SET pp = $1', [pp]);
    
          // Calculate PPU
          const ppuResult = await pool.query('SELECT ((usl - xbar) / (3 * sd))::numeric::decimal(10, 2) AS ppu FROM spc_result');
          const ppu = ppuResult.rows[0].ppu;
    
          // Update PPU in the spc_result table
          await pool.query('UPDATE spc_result SET PPU = $1', [ppu]);
    
          // Calculate PPL
          const pplResult = await pool.query('SELECT ((xbar - lsl) / (3 * sd))::numeric::decimal(10, 2) AS ppl FROM spc_result');
          const ppl = pplResult.rows[0].ppl;
    
          // Update PPL in the spc_result table
          await pool.query('UPDATE spc_result SET PPL = $1', [ppl]);
    
          // Calculate Ppk
          const ppkResult = await pool.query('SELECT LEAST((usl - xbar) / (3 * sd), (xbar - lsl) / (3 * sd))::numeric::decimal(10, 2) AS ppk FROM spc_result');
          const ppk = ppkResult.rows[0].ppk;
    
          // Update Ppk in the spc_result table
          await pool.query('UPDATE spc_result SET Ppk = $1', [ppk]); 

          // Calculate RBAR
          const rangeResult3 = await pool.query('SELECT (SUM(range) / COUNT(range))::numeric::decimal(10, 2) AS result FROM range_chart3 ');
          // const rangeResult3 = await pool.query('SELECT AVG(range)::numeric::decimal(10, 2) AS result FROM range_chart3');

          const rbar = rangeResult3.rows[0].result;

          // Update RBAR in the spc_result2 table   
          await pool.query('UPDATE spc_result3 SET RBAR = $1', [rbar]);
          await pool.query('UPDATE range_chart3 SET RBAR = $1', [rbar]);

          // Calculate SDW using rbar from range_chart3
          const sdwResult = await pool.query(`
          SELECT (rbar / 1.693)::numeric::decimal(10, 2) AS result
          FROM range_chart3
        `); 
         const sdw = sdwResult.rows[0].result;

          // Update SDW in the spc_result3 table
          await pool.query('UPDATE spc_result3 SET SDW = $1', [sdw]);
          await pool.query('UPDATE range_chart3 SET SDW = $1', [sdw]);

           // Calculate CP
    const cpResult = await pool.query('SELECT ((525 - 475) / (6 * sdw))::numeric::decimal(10, 2) AS result FROM range_chart3');
    const cp = cpResult.rows[0].result;

    // Update CP in the spc_result3 table
    await pool.query('UPDATE spc_result3 SET CP = $1', [cp]);
    await pool.query('UPDATE range_chart3 SET CP = $1', [cp]);

    // Calculate CPU
    const cpuResult = await pool.query('SELECT ((525 - (SELECT xbar FROM spc_result2 LIMIT 1)) / (3 * (SELECT sdw FROM range_chart3 LIMIT 1)))::numeric::decimal(10, 2) AS result FROM range_chart3');
    const cpu = cpuResult.rows[0].result;

    // Update CPU in the spc_result2 table
    await pool.query('UPDATE spc_result3 SET CPU = $1', [cpu]);
    await pool.query('UPDATE range_chart3 SET CPU = $1', [cpu]);

    // Calculate CPL
    const cplResult = await pool.query(`
      SELECT ((SELECT xbar FROM spc_result2 LIMIT 1) - 475) / (3 * (SELECT sdw FROM range_chart3 LIMIT 1))::numeric::decimal(10, 2) AS result FROM range_chart3
    `);
    const cpl = cplResult.rows[0].result.toFixed(2);

    // Update CPL in the spc_result2 table
    await pool.query('UPDATE spc_result3 SET CPL = $1', [cpl]);
    await pool.query('UPDATE range_chart3 SET CPL = $1', [cpl]);

    // Calculate CPK as the minimum of CPU and CPL
    const cpkResult = await pool.query(`
      SELECT
        LEAST(
          (SELECT cpu FROM range_chart3 LIMIT 1),
          (SELECT cpl FROM range_chart3 LIMIT 1)
        )::numeric::decimal(10, 2) AS cpk FROM range_chart3
    `);
    const cpk = cpkResult.rows[0].cpk;

    // Update CPK in the range_chart2 table
    await pool.query('UPDATE range_chart3 SET cpk = $1', [cpk]);
    
    // Calculate UCL
    const uclResult = await pool.query(`
      SELECT
        (SELECT xbar FROM spc_result2 LIMIT 1) +
        ((SELECT A2 FROM standardsample WHERE sample_size = 3) * (SELECT rbar FROM range_chart3 LIMIT 1))::numeric::decimal(10, 2) AS result
    `);
    const ucl = uclResult.rows[0].result;

    // Calculate LCL
    const lclResult = await pool.query(`
      SELECT
        (SELECT xbar FROM spc_result2 LIMIT 1) -
        ((SELECT A2 FROM standardsample WHERE sample_size = 3) * (SELECT rbar FROM range_chart3 LIMIT 1))::numeric::decimal(10, 2) AS result
    `);
    const lcl = lclResult.rows[0].result;

    // Update UCL and LCL in the spc_result2 table
    await pool.query('UPDATE spc_result3 SET ucl = $1, lcl = $2', [ucl, lcl]);

           // Send a response
           res.json({ xbar, sd, pp, ppu, ppl, ppk ,rbar,sdw,cp,cpu,cpl,cpk,ucl,lcl});
    
      }
          else {
          res.status(400).json({ error: 'Invalid option selected' });
        }
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });












