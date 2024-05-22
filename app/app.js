const express = require('express')
const app = express()
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const ejs = require('ejs');
const { Pool } = require('pg');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
require('dotenv').config();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// app.use(express.static("public"));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'sessions'
  }),
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

function checkSession(req, res, next) {
  if (!req.session.facilities) {
    // If no session exists, redirect to /facilities route and display alert
    res.redirect('/facilities');
    return;
  }
  next();
}

// Get stuff
app.get('/', (req, res) => {
  res.render('registration')
})

app.get('/login', async (req, res) => {
  res.render('login');
});

app.get('/home', async (req, res) => {
  res.render('home');
});

app.get('/referral', checkSession, (req, res) => {
  res.render('referral-form');
});

app.get('/specimen-movement', checkSession, async (req, res) => {
  res.render('specimen-movement-form');
})

app.get('/consultation', checkSession, async (req, res) => {
  res.render('consultation-form');
})

app.get('/confirm-action', checkSession, async (req, res) => {
  res.render('action');
})

app.get('/facilities', async (req, res) => {
  res.render('institution-selection');
})

// Post stuff
app.post('/referral', checkSession, async (req, res) => {
  try {
    const {
      date,
      time,
      facilityCode,
      clientName,
      age,
      sex,
      ipOpNumber,
      idNumber,
      nhifNumber,
      phoneNumber,
      address,
      county,
      subCounty,
      subLocation,
      assistantChief,
      assistantChiefPhoneNumber,
      referringFacility,
      receivingFacility,
      investigations,
      diagnosis,
      referralReason,
      requestingOfficerName,
      requestingOfficerDesignation,
      requestingPhoneNumber,
      requestingOfficerSignature,
      nextOfKinName,
      nextOfKinRelationship,
      nextOfKinPhoneNumber,
      specimen,
      source,
      collectionDate,
      collectionTime,
      preservationDate,
      preservationMethod,
      selectedService,
      selectedType
    } = req.body;

    // Insert referral data into PostgreSQL database
    const query = `
      INSERT INTO referrals (
          date, time, facility_code, client_name, client_age, client_sex,
          client_ipop_number, client_id_number, client_nhif_number,
          client_phone, client_physical_address, client_county,
          client_subcounty, client_sublocation, assistchief_name,
          assistchief_phonenumber, referring_facility, receiving_facility,
          client_history, client_diagnosis, reason_for_referral,
          referring_officer_name, referring_officer_designation,
          referring_officer_phone, referring_officer_signature,
          nextofkin_name, nextofkin_relationship, nextofkin_phone,
          specimen_description, specimen_source, collection_date,
          collection_time, preservation_date, preservation_method,
          service_level, referral_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
          $28, $29, $30, $31, $32, $33, $34, $35, $36)
    `;
    const values = [
      date, time, facilityCode, clientName, age, sex, ipOpNumber,
      idNumber, nhifNumber, phoneNumber, address, county, subCounty,
      subLocation, assistantChief, assistantChiefPhoneNumber,
      referringFacility, receivingFacility, investigations, diagnosis,
      referralReason, requestingOfficerName, requestingOfficerDesignation,
      requestingPhoneNumber, requestingOfficerSignature, nextOfKinName,
      nextOfKinRelationship, nextOfKinPhoneNumber, specimen, source,
      collectionDate, collectionTime, preservationDate, preservationMethod,
      selectedService, selectedType
    ];

    await pool.query(query, values);

    res.status(201).json({ message: 'Referral submitted successfully' });
  } catch (error) {
    console.error('Error submitting referral:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/consultation', checkSession, async (req, res) => {
  const {
    serviceLevel,
    date,
    time,
    clinicDepartment,
    consultant,
    clientName,
    age,
    sex,
    wardClinic,
    bedNumber,
    currentIpOpNumber,
    previousIpOpNumber1,
    previousIpOpNumber2,
    previousIpOpNumber3,
    previousIpOpNumberSpecify,
    diagnosis,
    investigations,
    consultationReason,
    requestingOfficerName,
    designation,
    phoneNumber,
    department,
    facility,
    requestingOfficerSignature,
    requestingOfficerDate
  } = req.body;

  try {
    // Construct the SQL query
    const query = `INSERT INTO consultations 
                   (service_level, date, time, clinic_department, consultant, client_name, age, sex, 
                    ward_clinic, bed_number, current_ip_op_number, previous_ip_op_number1, 
                    previous_ip_op_number2, previous_ip_op_number3, previous_ip_op_number_specify, 
                    diagnosis, investigations, consultation_reason, requesting_officer_name, 
                    designation, phone_number, department, facility, requesting_officer_signature, 
                    requesting_officer_date)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 
                           $19, $20, $21, $22, $23, $24, $25)`;

    // Execute the SQL query
    const result = await pool.query(query, [
      serviceLevel,
      date,
      time,
      clinicDepartment,
      consultant,
      clientName,
      age,
      sex,
      wardClinic,
      bedNumber,
      currentIpOpNumber,
      previousIpOpNumber1,
      previousIpOpNumber2,
      previousIpOpNumber3,
      previousIpOpNumberSpecify,
      diagnosis,
      investigations,
      consultationReason,
      requestingOfficerName,
      designation,
      phoneNumber,
      department,
      facility,
      requestingOfficerSignature,
      requestingOfficerDate
    ]);

    // console.log('Data inserted successfully');
    res.status(200).send('Data inserted successfully');
  } catch (error) {
    console.error('Error inserting data:', error);
    res.status(500).send('Error inserting data');
  }
});

app.post('/specimen-movement', checkSession, async (req, res) => {
  try {
    const {
      refno,
      ipOpNumber,
      patientName,
      age,
      sex,
      residence,
      postalAddress,
      specimen,
      source,
      collectionDate,
      collectionTime,
      preservationDate,
      preservationMethod,
      referringLab,
      referrrerName,
      designation,
      mobileNo,
      email,
      signature,
      investigationsRequested,
      labReferredTo,
      receiverName,
      receiverDesignation,
      receiverMobileNo,
      receiverEmail,
      receiverSignature
    } = req.body;

    // Assuming you have already set up the PostgreSQL connection and created the 'specimens' table

    // Construct the SQL query
    const query = `INSERT INTO specimens (
      refno,
      ip_op_number,
      patient_name,
      age,
      sex,
      residence,
      postal_address,
      specimen,
      source,
      collection_date,
      collection_time,
      preservation_date,
      preservation_method,
      referring_lab,
      referrer_name,
      designation,
      mobile_no,
      email,
      signature,
      investigations_requested,
      lab_referred_to,
      receiver_name,
      receiver_designation,
      receiver_mobile_no,
      receiver_email,
      receiver_signature
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`;

    // Execute the SQL query
    await pool.query(query, [
      refno,
      ipOpNumber,
      patientName,
      age,
      sex,
      residence,
      postalAddress,
      specimen,
      source,
      collectionDate,
      collectionTime,
      preservationDate,
      preservationMethod,
      referringLab,
      referrrerName,
      designation,
      mobileNo,
      email,
      signature,
      investigationsRequested,
      labReferredTo,
      receiverName,
      receiverDesignation,
      receiverMobileNo,
      receiverEmail,
      receiverSignature
    ]);

    // console.log('Data inserted successfully');
    res.status(200).send('Data inserted successfully');
  } catch (error) {
    console.error('Error inserting data:', error);
    res.status(500).send('Error inserting data');
  }
});

app.post('/fetch-outgoing-referrals', async (req, res) => {
  try {
    // SQL query to fetch all data from referrals table
    const query = "SELECT * FROM referrals";

    // Execute the query
    const { rows } = await pool.query(query);

    // Send the results back as a response
    res.json(rows);
  } catch (error) {
    // If any error occurs, send a 500 status code with the error message
    res.status(500).json({ message: error.message });
  }
});

app.post('/fetch-outgoing-consultations', async (req, res) => {
  try {
    // SQL query to fetch all data from referrals table
    const query = "SELECT * FROM consultations";

    // Execute the query
    const { rows } = await pool.query(query);

    // Send the results back as a response
    res.json(rows);
  } catch (error) {
    // If any error occurs, send a 500 status code with the error message
    res.status(500).json({ message: error.message });
  }
});

app.post('/fetch-outgoing-specimen', async (req, res) => {
  try {
    // SQL query to fetch all data from referrals table
    const query = "SELECT * FROM specimens";

    // Execute the query
    const { rows } = await pool.query(query);

    // Send the results back as a response
    res.json(rows);
  } catch (error) {
    // If any error occurs, send a 500 status code with the error message
    res.status(500).json({ message: error.message });
  }
});

app.post('/fetch-facilities', async (req, res) => {
  try {
    // SQL query to fetch all data from facilities table
    const query = "SELECT * FROM facilities";

    // Execute the query
    const { rows } = await pool.query(query);

    if (rows.length === 0) {
      // If no data is found, throw an error
      throw new Error("No facilities found in the database.");
    }

    // Store the fetched data in the session
    req.session.facilities = rows;

    // Send the results back as a response
    res.json(rows);
  } catch (error) {
    // If any error occurs, send a 500 status code with the error message
    res.status(500).json({ message: error.message });
  }
});

app.listen(port, () => {
  // console.log(`Example app listening on port ${port}`)
});