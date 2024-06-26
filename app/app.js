const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const ejs = require('ejs');
const { Pool } = require('pg');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const axios = require('axios');
const bcrypt = require('bcrypt');
require('dotenv').config();
const port = process.env.PORT || 3000;
const url = process.env.DIRECTUS_URL;
const token = process.env.TOKEN;
const saltRounds = 10;
const Redis = require('ioredis'); // Changed import to require
const redis = new Redis(); // Redis client initialization
const { promisify } = require('util');
const { fetch } = require('fetch-ponyfill')();
const fetchAsync = promisify(fetch);
const redisClient = redis

// Function to clear Redis cache
async function clearCache() {
  try {
    // Use the DEL command to delete the cached data
    await redisClient.del('cachedUsers');
    console.log('Cache cleared successfully.');
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

// Add a route to trigger cache clearance
app.get('/clear-cache', async (req, res) => {
  try {
    await clearCache();
    res.status(200).send('Cache cleared successfully.');
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

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
    tableName: 'session',
  }),
  secret: 'sqT_d_qxWqHyXS6Yk7Me8APygz3EjFE8',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));

const checkSession = (req, res, next) => {
  if (req.session.user) {
    next(); // Continue to the next middleware or route
  } else {
    res.redirect('/login'); // Redirect to the login page if no session is found
  }
};

const checkDepartmentSession = (req, res, next) => {
  if (req.session.user) {
    next(); // Continue to the next middleware or route
  } else {
    res.redirect('/department-login'); // Redirect to the login page if no session is found
  }
};

/**
    @param path  {String}
    @param config {RequestInit}
*/

// Get stuff
app.get('/', async (req, res) => {
  res.render('index');
});

app.get('/impostor/page', async (req, res) => {
  res.render('impostor');
});

app.get('/login', async (req, res) => {
  res.render('login');
});

async function query(path, config) {
  const res = await fetch(encodeURI(`${url}${path}`), {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...config
  });
  return res;
}

async function registerUser(userData) {
  let res = await query(`/items/users/`, {
    method: 'POST',
    body: JSON.stringify(userData) // Send user data in the request body
  });
  return await res.json();
}

app.post('/register', async (req, res) => {
  try {
    const { fullName, email, phone, hospital, password } = req.body;

    if (!fullName || !email || !phone || !hospital || !password) {
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const userData = {
      name: fullName, email: email, phone: phone, hosipital_id: hospital, password: hashedPassword
    };

    // Register the user
    const newUser = await registerUser(userData);

    // Send response indicating success
    res.status(201).json({ message: 'User registered successfully', user: newUser });
  } catch (error) {
    console.error('Error inserting user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function loginUser(email) {
  try {
    // console.log('Querying Directus for user with email:', email);
    const response = await query(`/items/users?filter[email][_eq]=${email}`, {
      method: 'SEARCH',
    });
    const users = await response.json(); // Extract JSON data from the response

    // Check if users array is empty or not
    if (!users || users.length === 0) {
      console.log('No user found with email:', email);
    }

    return users;
  } catch (error) {
    console.error('Error querying user data:', error);
    throw new Error('Error querying user data');
  }
}

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for missing fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    // Fetch user data from Directus
    const usersResponse = await loginUser(email);

    // If usersResponse is empty or undefined, return invalid credentials error
    if (!usersResponse || usersResponse.data.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = usersResponse.data[0]; // Extract the first user from the response

    // Compare provided password with the hashed password stored in the user's record
    const passwordMatch = await bcrypt.compare(password, user.password);

    // Handle invalid password
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check user status
    if (user.user_status === null || user.user_status === 'impostor') {
      // Respond with the redirect URL for impostor users
      return res.status(200).json({ redirect: '/impostor/page' });
    } else if (user.user_status === 'verified') {
      // Store user data in session
      req.session.user = user;
      // Respond with the redirect URL for real users
      return res.status(200).json({ redirect: '/home' });
    }

  } catch (error) {
    // Handle internal server error
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


async function getFacilities() {
  let res = await query(`/items/Hospitals/`, {
    method: 'GET',
  });
  return await res.json();
}

app.get('/cache-facilities', async (req, res) => {
  const cachedData = await redis.get('cachedData');

  if (cachedData) {
    // If data exists in the cache, return it
    res.send(JSON.parse(cachedData));
  } else {
    // If data is not in the cache, fetch it from the source
    try {
      const facilites = await getFacilities(); // Calling getFacilities function
      await redis.set('cachedData', JSON.stringify(facilites), 'EX', 3600); // Cache for 1 hour
      res.send(facilites);
    } catch (error) {
      // Handle error appropriately
      console.error('Error fetching data:', error);
      res.status(500).send('Internal Server Error');
    }
  }
});

async function getDepartmentsReferrals(county, department) {
  try {
    const res = await query(`/items/referral_notifications?filter[client_county][_eq]=${county}&filter[disease_category][_eq]=${department}`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

async function getDepartmentsConsultations(county, department) {
  try {
    const res = await query(`/items/consultation_notifications?filter[client_county][_eq]=${county}&filter[disease_category][_eq]=${department}`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

async function getOutgoingReferrals(hospitalId) {
  try {
    const res = await query(`/items/referral_notifications?filter[referring_facility_name][_eq]=${hospitalId}`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

async function getIncomingReferrals(hospitalId) {
  try {
    const res = await query(`/items/referral_notifications?filter[receiving_facility_name][_eq]=${hospitalId}`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

async function getOutgoingConsultation(hospitalId) {
  try {
    const res = await query(`/items/consultation_notifications?filter[requesting_officer_facility][_eq]=${hospitalId}`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

async function getIncomingConsultations(hospitalId) {
  try {
    const res = await query(`/items/consultation_notifications?filter[receiving_clinic][_eq]=${hospitalId}`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

async function getOutgoingSpecimen(hospitalId) {
  try {
    const res = await query(`/items/specimen_notifications?filter[referring_facility][_eq]=${hospitalId}`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

async function getIncomingSpecimen(hospitalId) {
  try {
    const res = await query(`/items/specimen_notifications?filter[receiving_facility][_eq]=${hospitalId}`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

app.get('/referral', checkSession, async (req, res) => {
  const user = req.session.user;
  res.render('referral-form', { user: user });
});

app.get('/specimen-movement', checkSession, async (req, res) => {
  const user = req.session.user;
  res.render('specimen-movement-form', { user: user });
});

app.get('/consultation', checkSession, async (req, res) => {
  const user = req.session.user;
  res.render('consultation-form', { user: user });
});

app.get('/home', checkSession, async (req, res) => {
  try {
    const facilities = await getFacilities();
    const user = req.session.user;

    // Fetch referrals for the logged-in user's hospital
    const referrals = await getOutgoingReferrals(user.hosipital_id);
    const incomingReferrals = await getIncomingReferrals(user.hosipital_id);
    const consultations = await getOutgoingConsultation(user.hosipital_id);
    const incomingConsultations = await getIncomingConsultations(user.hosipital_id);
    const specimens = await getOutgoingSpecimen(user.hosipital_id);
    const incomingSpecimen = await getIncomingSpecimen(user.hosipital_id);

    res.render('home', { facilities: facilities.data, user: user, referrals: referrals.data, incomingReferrals: incomingReferrals.data, consultations: consultations.data, incomingConsultations: incomingConsultations.data, specimens: specimens.data, incomingSpecimens: incomingSpecimen.data });
  } catch (error) {
    console.error('Error fetching facilities:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/register', async (req, res) => {
  res.render('registration');
})

app.get('/facilities', async (req, res) => {
  try {
    // Check if facilities data is available in the cache
    const cachedData = await redis.get('cachedData');

    if (cachedData) {
      // If data exists in the cache, send it as the response
      const facilities = JSON.parse(cachedData);
      res.json({ facilities: facilities.data });
    } else {
      // If data is not in the cache, fetch it from the source
      const facilities = await getFacilities();
      res.json({ facilities: facilities.data });

      // Cache the fetched data for future requests
      await redis.set('cachedData', JSON.stringify(facilities), 'EX', 3600); // Cache for 1 hour
    }
  } catch (error) {
    console.error('Error fetching facilities:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function pushReferral(referralData) {
  let res = await query(`/items/referral_notifications/`, {
    method: 'POST',
    body: JSON.stringify(referralData)
  });
  return await res.json();
}

app.post('/submit-referral', async (req, res) => {
  try {
    const {
      selectedService,
      selectedType,
      date,
      time,
      facilityCode,
      referringDepartment,
      receivingDepartment,
      referringFacility,
      receivingFacility,
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
      location,
      subLocation,
      assistantChief,
      assistantChiefPhoneNumber,
      category,
      investigations,
      diagnosis,
      referralReason,
      requestingOfficerName,
      requestingOfficerDesignation,
      requestingPhoneNumber,
      nextOfKinName,
      nextOfKinRelationship,
      nextOfKinPhoneNumber,
      specimen,
      source,
      collectionDate,
      collectionTime,
      preservationDate,
      preservationMethod
    } = req.body;

    const referralData = {
      service_level: selectedService,
      referral_type: selectedType,
      referral_date: date,
      referral_time: time,
      referring_facility_code: facilityCode,
      referring_department: referringDepartment,
      receiving_department: receivingDepartment,
      referring_facility_name: referringFacility,
      receiving_facility_name: receivingFacility,
      client_name: clientName,
      client_age: age,
      client_sex: sex,
      client_ipop_number: ipOpNumber,
      client_id_number: idNumber,
      client_nhif_number: nhifNumber,
      client_phone_number: phoneNumber,
      client_address: address,
      client_county: county,
      client_subcounty: subCounty,
      client_location: location,
      client_sublocation: subLocation,
      client_assistant_chief_name: assistantChief,
      client_assistant_chief_phone: assistantChiefPhoneNumber,
      disease_category: category,
      investigations: investigations,
      diagnosis: diagnosis,
      reason_for_referral: referralReason,
      requesting_officer_name: requestingOfficerName,
      requesting_officer_designation: requestingOfficerDesignation,
      requesting_officer_phone: requestingPhoneNumber,
      nex_of_kin_name: nextOfKinName,
      nex_of_kin_rship: nextOfKinRelationship,
      nex_of_kin_phone: nextOfKinPhoneNumber,
      specimen_name: specimen,
      specimen_source: source,
      specimen_collection_date: collectionDate,
      specimen_collection_time: collectionTime,
      specimen_preservation_date: preservationDate,
      specimen_preservation_method: preservationMethod
    };

    const newReferral = await pushReferral(referralData);

    // Send response indicating success
    res.status(201).json({ message: 'Referral added successfully', referral: newReferral });
  } catch (error) {
    console.error('Error submitting referral:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function pushConsultation(consultationData) {
  let res = await query(`/items/consultation_notifications/`, {
    method: 'POST',
    body: JSON.stringify(consultationData)
  });
  return await res.json();
}

app.post('/submit-consultation', async (req, res) => {

  try {
    const {
      serviceLevel,
      date,
      time,
      clininName,
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
      county,
      subCounty,
      location,
      subLocation,
      category,
      diagnosis,
      investigations,
      consultationReason,
      requestingOfficerName,
      designation,
      phoneNumber,
      department,
      facility,
    } = req.body;

    const consultationData = {
      service_level: serviceLevel,
      date: date,
      time: time,
      receiving_clinic: clininName,
      receiving_department: clinicDepartment,
      expert_name: consultant,
      client_name: clientName,
      client_age: age,
      client_sex: sex,
      ward_name: wardClinic,
      bed_number: bedNumber,
      current_ipop: currentIpOpNumber,
      previous_ipop1: previousIpOpNumber1,
      previous_ipop2: previousIpOpNumber2,
      previous_ipop2: previousIpOpNumber3,
      previous_ipop3: previousIpOpNumberSpecify,
      client_county: county,
      client_subcounty: subCounty,
      client_location: location,
      client_sublocation: subLocation,
      disease_category: category,
      diagnosis: diagnosis,
      investigations: investigations,
      consultation_reason: consultationReason,
      requesting_officer_name: requestingOfficerName,
      requesting_officer_designation: designation,
      requesting_officer_phone: phoneNumber,
      requesting_officer_department: department,
      requesting_officer_facility: facility
    };

    const newConsultation = await pushConsultation(consultationData);

    // Send response indicating success
    res.status(201).json({ message: 'Referral added successfully', consultation: newConsultation });
  } catch (error) {
    console.error('Error submitting referral:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }

});

async function pushSpecimen(specimenData) {
  let res = await query(`/items/specimen_notifications/`, {
    method: 'POST',
    body: JSON.stringify(specimenData)
  });
  return await res.json();
}

app.post('/submit-specimen', async (req, res) => {

  try {
    const {
      ipOpNumber,
      patientName,
      age,
      sex,
      residence,
      postalAddress,
      refno,
      specimen,
      source,
      collectionDate,
      collectionTime,
      preservationDate,
      preservationMethod,
      referringLab,
      receivingLab,
      referrrerName,
      designation,
      mobileNo,
      email,
      investigationsRequested,
    } = req.body;

    const specimenData = {
      client_ipop_number: ipOpNumber,
      client_name: patientName,
      client_age: age,
      client_sex: sex,
      client_residence: residence,
      client_postal_address: postalAddress,
      specimen_ref_number: refno,
      specimen_name: specimen,
      specimen_source: source,
      specimen_collection_date: collectionDate,
      specimen_collection_time: collectionTime,
      specimen_preservation_date: preservationDate,
      specimen_preservation_method: preservationMethod,
      referring_facility: referringLab,
      receiving_facility: receivingLab,
      referring_officer_name: referrrerName,
      referring_officer_designation: designation,
      referring_officer_phone: mobileNo,
      referring_officer_email: email,
      investigations_requested: investigationsRequested,
    };

    const newSpecimen = await pushSpecimen(specimenData);

    // Send response indicating success
    res.status(201).json({ message: 'Referral added successfully', specimen: newSpecimen });
  } catch (error) {
    console.error('Error submitting referral:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }

});

async function updateAcceptedReferrals(acceptedReferralData) {
  try {
    // Use your custom query function to send the update query
    const res = await query(`/items/referral_notifications/${acceptedReferralData.id}`, {
      method: 'PATCH', // Assuming you want to update an existing item
      body: JSON.stringify(acceptedReferralData)
    });
    const updatedData = await res.json();
    return updatedData;
  } catch (error) {
    console.error('Error:', error);
    throw new Error('Failed to update referral');
  }
}

app.post('/update-accepted-referrals', async (req, res) => {
  try {
    const { id, referOfficer, referOfficerPhone } = req.body;
    const status = "Accepted";
    const reason = "Patient processed succesfully ✔"
    const acceptedReferralData = { id: id, received_by: referOfficer, received_by_phone: referOfficerPhone, request_status: status, rejection_reason: reason };
    const updatedData = await updateAcceptedReferrals(acceptedReferralData);
    // console.log(updatedData);
    res.json(updatedData);
    // console.log(acceptedReferralData)
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function updateRejectedReferrals(rejectedReferralData) {
  try {
    // Use your custom query function to send the update query
    const res = await query(`/items/referral_notifications/${rejectedReferralData.id}`, {
      method: 'PATCH', // Assuming you want to update an existing item
      body: JSON.stringify(rejectedReferralData)
    });
    const updatedData = await res.json();
    return updatedData;
  } catch (error) {
    console.error('Error:', error);
    throw new Error('Failed to update referral');
  }
}

app.post('/update-rejected-referrals', async (req, res) => {
  try {
    const { id, referOfficer, referOfficerPhone, rejectionReason } = req.body;
    const status = "Rejected";
    const rejectedReferralData = { id: id, received_by: referOfficer, received_by_phone: referOfficerPhone, request_status: status, rejection_reason: rejectionReason };
    const updatedData = await updateRejectedReferrals(rejectedReferralData);
    // console.log(updatedData);
    res.json(updatedData);
    // console.log(acceptedReferralData)
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function updateAcceptedConsultations(acceptedConsultationsData) {
  try {
    // Use your custom query function to send the update query
    const res = await query(`/items/consultation_notifications/${acceptedConsultationsData.id}`, {
      method: 'PATCH', // Assuming you want to update an existing item
      body: JSON.stringify(acceptedConsultationsData)
    });
    const updatedData = await res.json();
    return updatedData;
  } catch (error) {
    console.error('Error:', error);
    throw new Error('Failed to update referral');
  }
}

app.post('/update-accepted-consultations', async (req, res) => {
  try {
    const { id, consOfficer, consOfficerPhone } = req.body;
    const status = "Accepted";
    const reason = "Patient processed succesfully ✔"
    const acceptedConsultationsData = { id: id, received_by: consOfficer, received_by_phone: consOfficerPhone, request_status: status, rejection_reason: reason };
    const updatedData = await updateAcceptedConsultations(acceptedConsultationsData);
    // console.log(updatedData);
    res.json(updatedData);
    // console.log(acceptedReferralData)
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});


async function updateRejectedConsultations(rejectedConsultationsData) {
  try {
    // Use your custom query function to send the update query
    const res = await query(`/items/consultation_notifications/${rejectedConsultationsData.id}`, {
      method: 'PATCH', // Assuming you want to update an existing item
      body: JSON.stringify(rejectedConsultationsData)
    });
    const updatedData = await res.json();
    return updatedData;
  } catch (error) {
    console.error('Error:', error);
    throw new Error('Failed to update');
  }
}

app.post('/update-rejected-consultations', async (req, res) => {
  try {
    const { id, consRejectingOfficer, consRejectingOfficerPhone, consRejectionReason } = req.body;
    const status = "Rejected";
    const rejectedConsultationsData = { id: id, received_by: consRejectingOfficer, received_by_phone: consRejectingOfficerPhone, request_status: status, rejection_reason: consRejectionReason };
    const updatedData = await updateRejectedConsultations(rejectedConsultationsData);
    // console.log(updatedData);
    res.json(updatedData);
    // console.log(acceptedReferralData)
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function updateAcceptedSpecimens(acceptedSpecimensData) {
  try {
    // Use your custom query function to send the update query
    const res = await query(`/items/specimen_notifications/${acceptedSpecimensData.id}`, {
      method: 'PATCH', // Assuming you want to update an existing item
      body: JSON.stringify(acceptedSpecimensData)
    });
    const updatedData = await res.json();
    return updatedData;
  } catch (error) {
    console.error('Error:', error);
    throw new Error('Failed to update referral');
  }
}

app.post('/update-accepted-specimens', async (req, res) => {
  try {
    const { id, specOfficer, specOfficerPhone } = req.body;
    const status = "Accepted";
    const reason = "Patient processed succesfully ✔"
    const acceptedSpecimensData = { id: id, received_by: specOfficer, received_by_phone: specOfficerPhone, request_status: status, rejection_reason: reason };
    const updatedData = await updateAcceptedSpecimens(acceptedSpecimensData);
    // console.log(updatedData);
    res.json(updatedData);
    // console.log(acceptedReferralData)
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});


async function updateRejectedSpecimens(rejectedSpecimensData) {
  try {
    // Use your custom query function to send the update query
    const res = await query(`/items/specimen_notifications/${rejectedSpecimensData.id}`, {
      method: 'PATCH', // Assuming you want to update an existing item
      body: JSON.stringify(rejectedSpecimensData)
    });
    const updatedData = await res.json();
    return updatedData;
  } catch (error) {
    console.error('Error:', error);
    throw new Error('Failed to update');
  }
}

app.post('/update-rejected-specimens', async (req, res) => {
  try {
    const { id, specRejectingOfficer, specRejectingOfficerPhone, specRejectionReason } = req.body;
    const status = "Rejected";
    const rejectedSpecimensData = { id: id, received_by: specRejectingOfficer, received_by_phone: specRejectingOfficerPhone, request_status: status, rejection_reason: specRejectionReason };
    const updatedData = await updateRejectedSpecimens(rejectedSpecimensData);
    // console.log(updatedData);
    res.json(updatedData);
    // console.log(acceptedReferralData)
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/department/register', async (req, res) => {
  res.render('departments-register')
});

app.get('/department/login', async (req, res) => {
  res.render('departments-login');
});

app.get('/department/dashboard', checkDepartmentSession, async (req, res) => {
  try {
    const user = req.session.user;
    const referralsObj = await getDepartmentsReferrals(user.county, user.departments);
    // const consultatiionObj = await getDepartmentsConsultations(user.county, user.departments);

    if (!referralsObj) {
      throw new Error("No referrals data found.");
    }

    const referrals = Object.values(referralsObj);

    let adultMaleCount = 0;
    let adultFemaleCount = 0;
    let childMaleCount = 0;
    let childFemaleCount = 0;
    let infantMaleCount = 0;
    let infantFemaleCount = 0;

    // Assuming referrals is a nested array, accessing the first element
    const allReferrals = referrals[0];

    // Ensure referrals is not undefined or null
    if (!allReferrals) {
      throw new Error("Referral data is undefined or null.");
    }

    allReferrals.forEach(referral => {
      try {
        const age = parseInt(referral.client_age);
        const gender = referral.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${referral.client_age}" for referral ID ${referral.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for referral ID ${referral.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            adultMaleCount++;
          } else {
            adultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            childMaleCount++;
          } else {
            childFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            infantMaleCount++;
          } else {
            infantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing referral:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalRefs = adultMaleCount + adultFemaleCount + childMaleCount + childFemaleCount + infantMaleCount + infantFemaleCount;

    const organizedReferrals = {
      adults: { male: adultMaleCount, female: adultFemaleCount },
      children: { male: childMaleCount, female: childFemaleCount },
      infants: { male: infantMaleCount, female: infantFemaleCount },
      totalRefs: totalRefs
    };

    const consultationObj = await getDepartmentsConsultations(user.county, user.departments);

    if (!consultationObj) {
      throw new Error("No consultation data found.");
    }

    const consultations = Object.values(consultationObj);

    let consAdultMaleCount = 0;
    let consAdultFemaleCount = 0;
    let consChildMaleCount = 0;
    let consChildFemaleCount = 0;
    let consInfantMaleCount = 0;
    let consInfantFemaleCount = 0;

    // Assuming consultations is a nested array, accessing the first element
    const allConsultations = consultations[0];

    // Ensure consultations is not undefined or null
    if (!allConsultations) {
      throw new Error("Consultation data is undefined or null.");
    }

    allConsultations.forEach(consultation => {
      try {
        const age = parseInt(consultation.client_age);
        const gender = consultation.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${consultation.client_age}" for consultation ID ${consultation.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for consultation ID ${consultation.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            consAdultMaleCount++;
          } else {
            consAdultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            consChildMaleCount++;
          } else {
            consChildFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            consInfantMaleCount++;
          } else {
            consInfantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing consultation:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalConsultations = consAdultMaleCount + consAdultFemaleCount + consChildMaleCount + consChildFemaleCount + consInfantMaleCount + consInfantFemaleCount;

    const organizedConsultations = {
      adults: { male: consAdultMaleCount, female: consAdultFemaleCount },
      children: { male: consChildMaleCount, female: consChildFemaleCount },
      infants: { male: consInfantMaleCount, female: consInfantFemaleCount },
      totalConsults: totalConsultations
    };


    res.render('department-dashboard', { user: user, referrals: organizedReferrals, consultations: organizedConsultations });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("An error occurred while processing your request.");
  }
});

app.get('/sub/department/referrals/analytics', checkSession, async (req, res) => {
  try {
    const user = req.session.user;
    const referralsObj = await getSubDepartmentsReferrals(user.sub_county, user.departments);
    // const consultatiionObj = await getDepartmentsConsultations(user.county, user.departments);

    if (!referralsObj) {
      throw new Error("No referrals data found.");
    }

    const referrals = Object.values(referralsObj);

    let adultMaleCount = 0;
    let adultFemaleCount = 0;
    let childMaleCount = 0;
    let childFemaleCount = 0;
    let infantMaleCount = 0;
    let infantFemaleCount = 0;

    // Assuming referrals is a nested array, accessing the first element
    const allReferrals = referrals[0];

    // Ensure referrals is not undefined or null
    if (!allReferrals) {
      throw new Error("Referral data is undefined or null.");
    }

    allReferrals.forEach(referral => {
      try {
        const age = parseInt(referral.client_age);
        const gender = referral.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${referral.client_age}" for referral ID ${referral.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for referral ID ${referral.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            adultMaleCount++;
          } else {
            adultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            childMaleCount++;
          } else {
            childFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            infantMaleCount++;
          } else {
            infantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing referral:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalRefs = adultMaleCount + adultFemaleCount + childMaleCount + childFemaleCount + infantMaleCount + infantFemaleCount;

    const organizedReferrals = {
      adults: { male: adultMaleCount, female: adultFemaleCount },
      children: { male: childMaleCount, female: childFemaleCount },
      infants: { male: infantMaleCount, female: infantFemaleCount },
      totalRefs: totalRefs
    };

    res.render('sub-referrals-analytics', { user: user, referrals: organizedReferrals, })

  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("An error occurred while processing your request.");
  }
})

app.get('/referrals/analytics', checkDepartmentSession, async (req, res) => {
  try {
    const user = req.session.user;
    const referralsObj = await getDepartmentsReferrals(user.county, user.departments);
    // const consultatiionObj = await getDepartmentsConsultations(user.county, user.departments);

    if (!referralsObj) {
      throw new Error("No referrals data found.");
    }

    const referrals = Object.values(referralsObj);

    let adultMaleCount = 0;
    let adultFemaleCount = 0;
    let childMaleCount = 0;
    let childFemaleCount = 0;
    let infantMaleCount = 0;
    let infantFemaleCount = 0;

    // Assuming referrals is a nested array, accessing the first element
    const allReferrals = referrals[0];

    // Ensure referrals is not undefined or null
    if (!allReferrals) {
      throw new Error("Referral data is undefined or null.");
    }

    allReferrals.forEach(referral => {
      try {
        const age = parseInt(referral.client_age);
        const gender = referral.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${referral.client_age}" for referral ID ${referral.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for referral ID ${referral.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            adultMaleCount++;
          } else {
            adultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            childMaleCount++;
          } else {
            childFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            infantMaleCount++;
          } else {
            infantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing referral:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalRefs = adultMaleCount + adultFemaleCount + childMaleCount + childFemaleCount + infantMaleCount + infantFemaleCount;

    const organizedReferrals = {
      adults: { male: adultMaleCount, female: adultFemaleCount },
      children: { male: childMaleCount, female: childFemaleCount },
      infants: { male: infantMaleCount, female: infantFemaleCount },
      totalRefs: totalRefs
    };

    res.render('referral-analytics', { user: user, referrals: organizedReferrals, })

  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("An error occurred while processing your request.");
  }
})

app.get('/consultations/analytics', checkDepartmentSession, async (req, res) => {
  try {
    const user = req.session.user;
    const consultationObj = await getDepartmentsConsultations(user.county, user.departments);

    if (!consultationObj) {
      throw new Error("No consultation data found.");
    }

    const consultations = Object.values(consultationObj);

    let consAdultMaleCount = 0;
    let consAdultFemaleCount = 0;
    let consChildMaleCount = 0;
    let consChildFemaleCount = 0;
    let consInfantMaleCount = 0;
    let consInfantFemaleCount = 0;

    // Assuming consultations is a nested array, accessing the first element
    const allConsultations = consultations[0];

    // Ensure consultations is not undefined or null
    if (!allConsultations) {
      throw new Error("Consultation data is undefined or null.");
    }

    allConsultations.forEach(consultation => {
      try {
        const age = parseInt(consultation.client_age);
        const gender = consultation.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${consultation.client_age}" for consultation ID ${consultation.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for consultation ID ${consultation.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            consAdultMaleCount++;
          } else {
            consAdultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            consChildMaleCount++;
          } else {
            consChildFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            consInfantMaleCount++;
          } else {
            consInfantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing consultation:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalConsultations = consAdultMaleCount + consAdultFemaleCount + consChildMaleCount + consChildFemaleCount + consInfantMaleCount + consInfantFemaleCount;

    const organizedConsultations = {
      adults: { male: consAdultMaleCount, female: consAdultFemaleCount },
      children: { male: consChildMaleCount, female: consChildFemaleCount },
      infants: { male: consInfantMaleCount, female: consInfantFemaleCount },
      totalConsults: totalConsultations
    };


    res.render('consultations-analytics', { user: user, consultations: organizedConsultations });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("An error occurred while processing your request.");
  }
})

app.get('/sub/department/consultations/analytics', checkSession, async (req, res) => {
  try {
    const user = req.session.user;
    const consultationObj = await getSubDepartmentsConsultations(user.sub_county, user.departments);

    if (!consultationObj) {
      throw new Error("No consultation data found.");
    }

    const consultations = Object.values(consultationObj);

    let consAdultMaleCount = 0;
    let consAdultFemaleCount = 0;
    let consChildMaleCount = 0;
    let consChildFemaleCount = 0;
    let consInfantMaleCount = 0;
    let consInfantFemaleCount = 0;

    // Assuming consultations is a nested array, accessing the first element
    const allConsultations = consultations[0];

    // Ensure consultations is not undefined or null
    if (!allConsultations) {
      throw new Error("Consultation data is undefined or null.");
    }

    allConsultations.forEach(consultation => {
      try {
        const age = parseInt(consultation.client_age);
        const gender = consultation.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${consultation.client_age}" for consultation ID ${consultation.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for consultation ID ${consultation.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            consAdultMaleCount++;
          } else {
            consAdultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            consChildMaleCount++;
          } else {
            consChildFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            consInfantMaleCount++;
          } else {
            consInfantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing consultation:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalConsultations = consAdultMaleCount + consAdultFemaleCount + consChildMaleCount + consChildFemaleCount + consInfantMaleCount + consInfantFemaleCount;

    const organizedConsultations = {
      adults: { male: consAdultMaleCount, female: consAdultFemaleCount },
      children: { male: consChildMaleCount, female: consChildFemaleCount },
      infants: { male: consInfantMaleCount, female: consInfantFemaleCount },
      totalConsults: totalConsultations
    };


    res.render('sub-consultation-analytics', { user: user, consultations: organizedConsultations });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("An error occurred while processing your request.");
  }
})

async function registerDepartments(userData) {
  let res = await query(`/items/departments/`, {
    method: 'POST',
    body: JSON.stringify(userData) // Send user data in the request body
  });
  return await res.json();
}

app.post('/department-register', async (req, res) => {
  try {
    const { fullName, email, phone, department, county, password } = req.body;

    if (!fullName || !email || !phone || !department || !county || !password) {
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const userData = {
      name: fullName, email: email, phone: phone, departments: department, county: county, password: hashedPassword
    };

    // Register the user
    const newUser = await registerDepartments(userData);

    // Send response indicating success
    res.status(201).json({ message: 'User registered successfully', department: newUser });
  } catch (error) {
    console.error('Error inserting user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/sub/department/register', async (req, res) => {
  res.render('sub-departments-register');
});

app.get('/sub/department/login', async (req, res) => {
  res.render('sub-departments-login');
});

// Sub departments
async function registerSubDepartments(userData) {
  let res = await query(`/items/sub_departments/`, {
    method: 'POST',
    body: JSON.stringify(userData) // Send user data in the request body
  });
  return await res.json();
}

app.post('/sub-department-register', async (req, res) => {
  try {
    const { fullName, email, phone, department, subCounty, password } = req.body;

    if (!fullName || !email || !phone || !department || !subCounty || !password) {
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const userData = {
      name: fullName, email: email, phone: phone, departments: department, sub_county: subCounty, password: hashedPassword
    };

    // Register the user
    const newUser = await registerSubDepartments(userData);

    // Send response indicating success
    res.status(201).json({ message: 'User registered successfully', subDepartment: newUser });
  } catch (error) {
    console.error('Error inserting user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function loginSubDepartment(email) {
  try {
    // console.log('Querying Directus for user with email:', email);
    const response = await query(`/items/sub_departments?filter[email][_eq]=${email}`, {
      method: 'SEARCH',
    });
    const users = await response.json(); // Extract JSON data from the response

    // Check if users array is empty or not
    if (!users || users.length === 0) {
      console.log('No user found with email:', email);
    }

    return users;
  } catch (error) {
    console.error('Error querying user data:', error);
    throw new Error('Error querying user data');
  }
}

async function loginDepartment(email) {
  try {
    // console.log('Querying Directus for user with email:', email);
    const response = await query(`/items/departments?filter[email][_eq]=${email}`, {
      method: 'SEARCH',
    });
    const users = await response.json(); // Extract JSON data from the response

    // Check if users array is empty or not
    if (!users || users.length === 0) {
      console.log('No user found with email:', email);
    }

    return users;
  } catch (error) {
    console.error('Error querying user data:', error);
    throw new Error('Error querying user data');
  }
}

app.post('/sub-departments-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // console.log('Received login request:', email);

    // Check for missing fields
    if (!email || !password) {
      // console.log('Missing email or password');
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    // Fetch user data from Directus
    // console.log('Fetching user data for email:', email);
    const usersResponse = await loginSubDepartment(email);

    // If usersResponse is empty or undefined, return invalid credentials error
    if (!usersResponse || usersResponse.data.length === 0) {
      // console.log('User not found with email:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = usersResponse.data[0]; // Extract the first user from the response

    // Compare provided password with the hashed password stored in the user's record
    // console.log('Comparing passwords for user:', user.email);
    const passwordMatch = await bcrypt.compare(password, user.password);

    // Handle invalid password
    if (!passwordMatch) {
      console.log('Invalid password for user:', user.email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Store user data in session
    // console.log('User logged in successfully:', user.email);
    req.session.user = user;

    // Send response indicating success
    res.status(200).json({ message: 'User logged in successfully', user });
  } catch (error) {
    // Handle internal server error
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Sub departmens login
app.post('/departments-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log(req.body);

    // console.log('Received login request:', email);

    // Check for missing fields
    if (!email || !password) {
      // console.log('Missing email or password');
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    // Fetch user data from Directus
    // console.log('Fetching user data for email:', email);
    const usersResponse = await loginDepartment(email);

    // If usersResponse is empty or undefined, return invalid credentials error
    if (!usersResponse || usersResponse.data.length === 0) {
      // console.log('User not found with email:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = usersResponse.data[0]; // Extract the first user from the response

    // Compare provided password with the hashed password stored in the user's record
    // console.log('Comparing passwords for user:', user.email);
    const passwordMatch = await bcrypt.compare(password, user.password);

    // Handle invalid password
    if (!passwordMatch) {
      console.log('Invalid password for user:', user.email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Store user data in session
    // console.log('User logged in successfully:', user.email);
    req.session.user = user;

    // Send response indicating success
    res.status(200).json({ message: 'User logged in successfully', user });
  } catch (error) {
    // Handle internal server error
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function getIp() {
  try {
    let res = await query(`/items/addresses/`, {
      method: 'GET',
    });

    // Check if response status is OK
    if (!res.ok) {
      throw new Error('Failed to fetch addresses data.');
    }

    // Parse response data
    const responseData = await res.json();

    // Extract IP addresses from data
    const ipAddresses = responseData.data.map(item => item.ip_address);

    return ipAddresses;
  } catch (error) {
    console.error('Error fetching addresses:', error);
    throw error; // Re-throw the error to handle it at a higher level
  }
}

app.get('/cache-addresses', async (req, res) => {
  const cachedData = await redis.get('cachedData');

  if (cachedData) {
    // If data exists in the cache, return it
    res.send(JSON.parse(cachedData));
  } else {
    // If data is not in the cache, fetch it from the source
    try {
      const addresses = await getIp(); // Calling getFacilities function
      await redis.set('cachedData', JSON.stringify(addresses), 'EX', 3600); // Cache for 1 hour
      res.send(addresses);
    } catch (error) {
      // Handle error appropriately
      console.error('Error fetching data:', error);
      res.status(500).send('Internal Server Error');
    }
  }
});

app.get('/hospital/admin/register', async (req, res) => {
  try {
    const addresses = await getIp(); // Fetch allowed IP addresses
    const requesterIp = req.ip; // Get requester's IP address

    // Ensure addresses is an array
    if (!Array.isArray(addresses)) {
      throw new Error('Addresses data is not an array.');
    }

    let isAllowed = addresses.some(address => {
      // Normalize IP addresses to ensure consistent comparison
      const normalizedAddress = normalizeIpAddress(address);
      const normalizedRequesterIp = normalizeIpAddress(requesterIp);
      return normalizedAddress === normalizedRequesterIp;
    });

    // Function to normalize IP address
    function normalizeIpAddress(ip) {
      // Remove the IPv4-mapped IPv6 prefix if present
      return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    }

    if (isAllowed) {
      // If allowed, render the registration page
      res.render('hospital-admin-registration');
    } else {
      // If not allowed, send an error response
      res.status(403).send(`Your IP address (${requesterIp}) is not allowed to access this route.`);
    }
  } catch (error) {
    // Handle error appropriately
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

async function registerHospitalAdmin(userData) {
  let res = await query(`/items/Hospital_admin/`, {
    method: 'POST',
    body: JSON.stringify(userData) // Send user data in the request body
  });
  return await res.json();
}

app.post('/hospital-admin-register', async (req, res) => {
  try {
    const { fullName, email, phone, hospital, password } = req.body;

    if (!fullName || !email || !phone || !hospital || !password) {
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const userData = {
      name: fullName, email: email, phone: phone, hospital_id: hospital, password: hashedPassword
    };


    // Register the user
    const newUser = await registerHospitalAdmin(userData);

    // Send response indicating success
    res.status(201).json({ message: 'User registered successfully', user: newUser });
  } catch (error) {
    console.error('Error inserting user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/hospital/admin/login', async (req, res) => {
  res.render('hospital-admin-login');
})

async function loginHospitalAdmin(email) {
  try {
    // console.log('Querying Directus for user with email:', email);
    const response = await query(`/items/Hospital_admin?filter[email][_eq]=${email}`, {
      method: 'SEARCH',
    });
    const users = await response.json(); // Extract JSON data from the response

    // Check if users array is empty or not
    if (!users || users.length === 0) {
      console.log('No user found with email:', email);
    }

    return users;
  } catch (error) {
    console.error('Error querying user data:', error);
    throw new Error('Error querying user data');
  }
}

app.post('/hospital-admin-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // console.log('Received login request:', email);

    // Check for missing fields
    if (!email || !password) {
      // console.log('Missing email or password');
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    // Fetch user data from Directus
    // console.log('Fetching user data for email:', email);
    const usersResponse = await loginHospitalAdmin(email);

    // If usersResponse is empty or undefined, return invalid credentials error
    if (!usersResponse || usersResponse.data.length === 0) {
      // console.log('User not found with email:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = usersResponse.data[0]; // Extract the first user from the response

    // Compare provided password with the hashed password stored in the user's record
    // console.log('Comparing passwords for user:', user.email);
    const passwordMatch = await bcrypt.compare(password, user.password);

    // Handle invalid password
    if (!passwordMatch) {
      console.log('Invalid password for user:', user.email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Store user data in session
    // console.log('User logged in successfully:', user.email);
    req.session.user = user;

    // Send response indicating success
    res.status(200).json({ message: 'User logged in successfully', user });
  } catch (error) {
    // Handle internal server error
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function getUsers(hospitalId) {
  try {
    const res = await query(`/items/users?filter[hosipital_id][_eq]=${hospitalId}`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching users:', error);
    throw new Error('Error fetching users');
  }
}

app.get('/cache-users', async (req, res) => {
  try {
    // Get logged-in user's information from the session
    const loggedInUser = req.session.user;

    // Extract hospital ID from the logged-in user's data
    const hospitalId = loggedInUser.hospital_id;

    // Fetch users based on the hospital ID
    const users = await getUsers(hospitalId);
    // console.log(users);

    // Cache users data in Redis for one hour
    await redis.set('cachedUsers', JSON.stringify(users), 'EX', 3600);

    // Return the cached users data
    res.json(users);
  } catch (error) {
    console.error('Error caching users:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/hospital/admin/dashboard', async (req, res) => {
  try {
    // Fetch cached users data from Redis
    const cachedUsers = await redis.get('cachedUsers');
    // console.log(cachedUsers);

    let userData = {}; // Initialize userData object

    // Parse the cached users data
    if (cachedUsers) {
      userData = JSON.parse(cachedUsers);
    } else {
      // If no cached data exists, fetch users from the database
      const loggedInUser = req.session.user;
      const hospitalId = loggedInUser.hospital_id;
      userData = await getUsers(hospitalId);

      // Cache users data in Redis for one hour
      await redis.set('cachedUsers', JSON.stringify(userData), 'EX', 3600);
    }

    // Ensure userData is an object before rendering the template
    if (typeof userData !== 'object') {
      throw new Error('Users data is not an object.');
    }

    // Render the dashboard template with the userData
    res.render('hospital-admin-dashboard', { userData });
  } catch (error) {
    console.error('Error rendering hospital admin dashboard:', error);
    res.status(500).send('Internal Server Error');
  }
});

async function updateVerifiedUser(verifiedData) {
  try {
    // Use your custom query function to send the update query
    const res = await query(`/items/users/${verifiedData.id}`, {
      method: 'PATCH', // Assuming you want to update an existing item
      body: JSON.stringify(verifiedData)
    });
    const updatedData = await res.json();
    return updatedData;
  } catch (error) {
    console.error('Error:', error);
    throw new Error('Failed to update referral');
  }
}

app.post('/verify-user', async (req, res) => {
  try {
    const { id } = req.body;
    const status = "verified";
    const verifiedData = { id: id, user_status: status };
    const updatedData = await updateVerifiedUser(verifiedData);
    // console.log(updatedData);
    res.json(updatedData);
    // console.log(acceptedReferralData)
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function updateRejectedUser(verifiedData) {
  try {
    // Use your custom query function to send the update query
    const res = await query(`/items/users/${verifiedData.id}`, {
      method: 'PATCH', // Assuming you want to update an existing item
      body: JSON.stringify(verifiedData)
    });
    const updatedData = await res.json();
    return updatedData;
  } catch (error) {
    console.error('Error:', error);
    throw new Error('Failed to update referral');
  }
}

app.post('/reject-user', async (req, res) => {
  try {
    const { id } = req.body;
    const status = "impostor";
    const verifiedData = { id: id, user_status: status };
    const updatedData = await updateRejectedUser(verifiedData);
    // console.log(updatedData);
    res.json(updatedData);
    // console.log(acceptedReferralData)
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function getSubDepartmentsReferrals(subCounty, department) {
  try {
    const res = await query(`/items/referral_notifications?filter[client_subcounty][_eq]=${subCounty}&filter[disease_category][_eq]=${department}`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

async function getSubDepartmentsConsultations(subCounty, department) {
  try {
    const res = await query(`/items/consultation_notifications?filter[client_subcounty][_eq]=${subCounty}&filter[disease_category][_eq]=${department}`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

app.get('/sub/department/dashboard', checkSession, async (req, res) => {
  try {
    const user = req.session.user;
    const referralsObj = await getSubDepartmentsReferrals(user.sub_county, user.departments);
    // const consultatiionObj = await getDepartmentsConsultations(user.county, user.departments);

    if (!referralsObj) {
      throw new Error("No referrals data found.");
    }

    const referrals = Object.values(referralsObj);

    let adultMaleCount = 0;
    let adultFemaleCount = 0;
    let childMaleCount = 0;
    let childFemaleCount = 0;
    let infantMaleCount = 0;
    let infantFemaleCount = 0;

    // Assuming referrals is a nested array, accessing the first element
    const allReferrals = referrals[0];

    // Ensure referrals is not undefined or null
    if (!allReferrals) {
      throw new Error("Referral data is undefined or null.");
    }

    allReferrals.forEach(referral => {
      try {
        const age = parseInt(referral.client_age);
        const gender = referral.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${referral.client_age}" for referral ID ${referral.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for referral ID ${referral.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            adultMaleCount++;
          } else {
            adultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            childMaleCount++;
          } else {
            childFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            infantMaleCount++;
          } else {
            infantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing referral:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalRefs = adultMaleCount + adultFemaleCount + childMaleCount + childFemaleCount + infantMaleCount + infantFemaleCount;

    const organizedReferrals = {
      adults: { male: adultMaleCount, female: adultFemaleCount },
      children: { male: childMaleCount, female: childFemaleCount },
      infants: { male: infantMaleCount, female: infantFemaleCount },
      totalRefs: totalRefs
    };

    const consultationObj = await getSubDepartmentsConsultations(user.sub_county, user.departments);

    if (!consultationObj) {
      throw new Error("No consultation data found.");
    }

    const consultations = Object.values(consultationObj);

    let consAdultMaleCount = 0;
    let consAdultFemaleCount = 0;
    let consChildMaleCount = 0;
    let consChildFemaleCount = 0;
    let consInfantMaleCount = 0;
    let consInfantFemaleCount = 0;

    // Assuming consultations is a nested array, accessing the first element
    const allConsultations = consultations[0];

    // Ensure consultations is not undefined or null
    if (!allConsultations) {
      throw new Error("Consultation data is undefined or null.");
    }

    allConsultations.forEach(consultation => {
      try {
        const age = parseInt(consultation.client_age);
        const gender = consultation.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${consultation.client_age}" for consultation ID ${consultation.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for consultation ID ${consultation.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            adultMaleCount++;
          } else {
            adultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            childMaleCount++;
          } else {
            childFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            infantMaleCount++;
          } else {
            infantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing consultation:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalConsultations = consAdultMaleCount + consAdultFemaleCount + consChildMaleCount + consChildFemaleCount + consInfantMaleCount + consInfantFemaleCount;

    const organizedConsultations = {
      adults: { male: consAdultMaleCount, female: consAdultFemaleCount },
      children: { male: consChildMaleCount, female: consChildFemaleCount },
      infants: { male: consInfantMaleCount, female: consInfantFemaleCount },
      totalConsults: totalConsultations
    };


    res.render('sub-departments-dashboard', { user: user, referrals: organizedReferrals, consultations: organizedConsultations });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("An error occurred while processing your request.");
  }
});

app.get('/sub/county/department/register', async (req, res) => {
  res.render('sub-county-health-registration');
});

app.get('/sub/county/department/login', async (req, res) => {
  res.render('sub-county-health-login');
});

async function getSubCountyReferrals(subCounty) {
  try {
    const res = await query(`/items/referral_notifications?filter[client_subcounty][_eq]=${subCounty}`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

async function getSubCountyConsultations(subCounty) {
  try {
    const res = await query(`/items/consultation_notifications?filter[client_subcounty][_eq]=${subCounty}`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

app.get('/sub/county/department/dashboard', checkSession, async (req, res) => {
  try {
    const user = req.session.user;
    const referralsObj = await getSubCountyReferrals(user.sub_county);
    // const consultatiionObj = await getDepartmentsConsultations(user.county, user.departments);

    if (!referralsObj) {
      throw new Error("No referrals data found.");
    }

    const referrals = Object.values(referralsObj);

    let adultMaleCount = 0;
    let adultFemaleCount = 0;
    let childMaleCount = 0;
    let childFemaleCount = 0;
    let infantMaleCount = 0;
    let infantFemaleCount = 0;

    // Assuming referrals is a nested array, accessing the first element
    const allReferrals = referrals[0];

    // Ensure referrals is not undefined or null
    if (!allReferrals) {
      throw new Error("Referral data is undefined or null.");
    }

    allReferrals.forEach(referral => {
      try {
        const age = parseInt(referral.client_age);
        const gender = referral.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${referral.client_age}" for referral ID ${referral.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for referral ID ${referral.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            adultMaleCount++;
          } else {
            adultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            childMaleCount++;
          } else {
            childFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            infantMaleCount++;
          } else {
            infantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing referral:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalRefs = adultMaleCount + adultFemaleCount + childMaleCount + childFemaleCount + infantMaleCount + infantFemaleCount;

    const organizedReferrals = {
      adults: { male: adultMaleCount, female: adultFemaleCount },
      children: { male: childMaleCount, female: childFemaleCount },
      infants: { male: infantMaleCount, female: infantFemaleCount },
      totalRefs: totalRefs
    };

    const consultationObj = await getSubCountyConsultations(user.sub_county, user.departments);

    if (!consultationObj) {
      throw new Error("No consultation data found.");
    }

    const consultations = Object.values(consultationObj);

    let consAdultMaleCount = 0;
    let consAdultFemaleCount = 0;
    let consChildMaleCount = 0;
    let consChildFemaleCount = 0;
    let consInfantMaleCount = 0;
    let consInfantFemaleCount = 0;

    // Assuming consultations is a nested array, accessing the first element
    const allConsultations = consultations[0];

    // Ensure consultations is not undefined or null
    if (!allConsultations) {
      throw new Error("Consultation data is undefined or null.");
    }

    allConsultations.forEach(consultation => {
      try {
        const age = parseInt(consultation.client_age);
        const gender = consultation.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${consultation.client_age}" for consultation ID ${consultation.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for consultation ID ${consultation.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            adultMaleCount++;
          } else {
            adultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            childMaleCount++;
          } else {
            childFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            infantMaleCount++;
          } else {
            infantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing consultation:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalConsultations = consAdultMaleCount + consAdultFemaleCount + consChildMaleCount + consChildFemaleCount + consInfantMaleCount + consInfantFemaleCount;

    const organizedConsultations = {
      adults: { male: consAdultMaleCount, female: consAdultFemaleCount },
      children: { male: consChildMaleCount, female: consChildFemaleCount },
      infants: { male: consInfantMaleCount, female: consInfantFemaleCount },
      totalConsults: totalConsultations
    };


    res.render('sub-county-dashboard', { user: user, referrals: organizedReferrals, consultations: organizedConsultations });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("An error occurred while processing your request.");
  }
});

async function registerSubCounty(userData) {
  let res = await query(`/items/sub_county/`, {
    method: 'POST',
    body: JSON.stringify(userData) // Send user data in the request body
  });
  return await res.json();
}

app.get('/sub/county/referrals/analytics', async (req, res) => {
  try {
    const user = req.session.user;
    const referralsObj = await getSubCountyReferrals(user.sub_county);
    // const consultatiionObj = await getDepartmentsConsultations(user.county, user.departments);

    if (!referralsObj) {
      throw new Error("No referrals data found.");
    }

    const referrals = Object.values(referralsObj);

    let adultMaleCount = 0;
    let adultFemaleCount = 0;
    let childMaleCount = 0;
    let childFemaleCount = 0;
    let infantMaleCount = 0;
    let infantFemaleCount = 0;

    // Assuming referrals is a nested array, accessing the first element
    const allReferrals = referrals[0];

    // Ensure referrals is not undefined or null
    if (!allReferrals) {
      throw new Error("Referral data is undefined or null.");
    }

    allReferrals.forEach(referral => {
      try {
        const age = parseInt(referral.client_age);
        const gender = referral.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${referral.client_age}" for referral ID ${referral.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for referral ID ${referral.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            adultMaleCount++;
          } else {
            adultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            childMaleCount++;
          } else {
            childFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            infantMaleCount++;
          } else {
            infantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing referral:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalRefs = adultMaleCount + adultFemaleCount + childMaleCount + childFemaleCount + infantMaleCount + infantFemaleCount;

    const organizedReferrals = {
      adults: { male: adultMaleCount, female: adultFemaleCount },
      children: { male: childMaleCount, female: childFemaleCount },
      infants: { male: infantMaleCount, female: infantFemaleCount },
      totalRefs: totalRefs
    };

    res.render('sub-county-referral-analytics', { user: user, referrals: organizedReferrals, })

  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("An error occurred while processing your request.");
  }
})

app.get('/sub/county/consultations/analytics', async (req, res) => {
  try {
    const user = req.session.user;
    const consultationObj = await getSubCountyConsultations(user.sub_county);

    if (!consultationObj) {
      throw new Error("No consultation data found.");
    }

    const consultations = Object.values(consultationObj);

    let consAdultMaleCount = 0;
    let consAdultFemaleCount = 0;
    let consChildMaleCount = 0;
    let consChildFemaleCount = 0;
    let consInfantMaleCount = 0;
    let consInfantFemaleCount = 0;

    // Assuming consultations is a nested array, accessing the first element
    const allConsultations = consultations[0];

    // Ensure consultations is not undefined or null
    if (!allConsultations) {
      throw new Error("Consultation data is undefined or null.");
    }

    allConsultations.forEach(consultation => {
      try {
        const age = parseInt(consultation.client_age);
        const gender = consultation.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${consultation.client_age}" for consultation ID ${consultation.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for consultation ID ${consultation.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            consAdultMaleCount++;
          } else {
            consAdultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            consChildMaleCount++;
          } else {
            consChildFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            consInfantMaleCount++;
          } else {
            consInfantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing consultation:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalConsultations = consAdultMaleCount + consAdultFemaleCount + consChildMaleCount + consChildFemaleCount + consInfantMaleCount + consInfantFemaleCount;

    const organizedConsultations = {
      adults: { male: consAdultMaleCount, female: consAdultFemaleCount },
      children: { male: consChildMaleCount, female: consChildFemaleCount },
      infants: { male: consInfantMaleCount, female: consInfantFemaleCount },
      totalConsults: totalConsultations
    };


    res.render('sub-county-consultation-analytics', { user: user, consultations: organizedConsultations });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("An error occurred while processing your request.");
  }
})

app.post('/sub-county-register', async (req, res) => {
  try {
    const { fullName, email, phone, subCounty, password } = req.body;

    if (!fullName || !email || !phone || !subCounty || !password) {
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const userData = {
      name: fullName, email: email, phone: phone, sub_county: subCounty, password: hashedPassword
    };


    // Register the user
    const newUser = await registerSubCounty(userData);

    // Send response indicating success
    res.status(201).json({ message: 'User registered successfully', user: newUser });
  } catch (error) {
    console.error('Error inserting user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function loginSubCounty(email) {
  try {
    // console.log('Querying Directus for user with email:', email);
    const response = await query(`/items/sub_county?filter[email][_eq]=${email}`, {
      method: 'SEARCH',
    });
    const users = await response.json(); // Extract JSON data from the response

    // Check if users array is empty or not
    if (!users || users.length === 0) {
      console.log('No user found with email:', email);
    }

    return users;
  } catch (error) {
    console.error('Error querying user data:', error);
    throw new Error('Error querying user data');
  }
}

app.post('/sub-county-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // console.log('Received login request:', email);

    // Check for missing fields
    if (!email || !password) {
      // console.log('Missing email or password');
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    // Fetch user data from Directus
    // console.log('Fetching user data for email:', email);
    const usersResponse = await loginSubCounty(email);

    // If usersResponse is empty or undefined, return invalid credentials error
    if (!usersResponse || usersResponse.data.length === 0) {
      // console.log('User not found with email:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = usersResponse.data[0]; // Extract the first user from the response

    // Compare provided password with the hashed password stored in the user's record
    // console.log('Comparing passwords for user:', user.email);
    const passwordMatch = await bcrypt.compare(password, user.password);

    // Handle invalid password
    if (!passwordMatch) {
      console.log('Invalid password for user:', user.email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Store user data in session
    // console.log('User logged in successfully:', user.email);
    req.session.user = user;

    // Send response indicating success
    res.status(200).json({ message: 'User logged in successfully', user });
  } catch (error) {
    // Handle internal server error
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/county/register', async (req, res) => {
  res.render('county-register');
})

app.get('/county/login', async (req, res) => {
  res.render('county-login');
})

async function getCountyConsultations(county) {
  try {
    const res = await query(`/items/consultation_notifications?filter[client_county][_eq]=${county}`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

async function getCountyReferrals(county) {
  try {
    const res = await query(`/items/referral_notifications?filter[client_county][_eq]=${county}`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

app.get('/county/department/dashboard', async (req, res) => {
  try {
    const user = req.session.user;
    const referralsObj = await getCountyReferrals(user.county);
    // const consultatiionObj = await getDepartmentsConsultations(user.county, user.departments);

    if (!referralsObj) {
      throw new Error("No referrals data found.");
    }

    const referrals = Object.values(referralsObj);

    let adultMaleCount = 0;
    let adultFemaleCount = 0;
    let childMaleCount = 0;
    let childFemaleCount = 0;
    let infantMaleCount = 0;
    let infantFemaleCount = 0;

    // Assuming referrals is a nested array, accessing the first element
    const allReferrals = referrals[0];

    // Ensure referrals is not undefined or null
    if (!allReferrals) {
      throw new Error("Referral data is undefined or null.");
    }

    allReferrals.forEach(referral => {
      try {
        const age = parseInt(referral.client_age);
        const gender = referral.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${referral.client_age}" for referral ID ${referral.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for referral ID ${referral.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            adultMaleCount++;
          } else {
            adultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            childMaleCount++;
          } else {
            childFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            infantMaleCount++;
          } else {
            infantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing referral:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalRefs = adultMaleCount + adultFemaleCount + childMaleCount + childFemaleCount + infantMaleCount + infantFemaleCount;

    const organizedReferrals = {
      adults: { male: adultMaleCount, female: adultFemaleCount },
      children: { male: childMaleCount, female: childFemaleCount },
      infants: { male: infantMaleCount, female: infantFemaleCount },
      totalRefs: totalRefs
    };

    const consultationObj = await getCountyConsultations(user.county);

    if (!consultationObj) {
      throw new Error("No consultation data found.");
    }

    const consultations = Object.values(consultationObj);

    let consAdultMaleCount = 0;
    let consAdultFemaleCount = 0;
    let consChildMaleCount = 0;
    let consChildFemaleCount = 0;
    let consInfantMaleCount = 0;
    let consInfantFemaleCount = 0;

    // Assuming consultations is a nested array, accessing the first element
    const allConsultations = consultations[0];

    // Ensure consultations is not undefined or null
    if (!allConsultations) {
      throw new Error("Consultation data is undefined or null.");
    }

    allConsultations.forEach(consultation => {
      try {
        const age = parseInt(consultation.client_age);
        const gender = consultation.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${consultation.client_age}" for consultation ID ${consultation.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for consultation ID ${consultation.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            adultMaleCount++;
          } else {
            adultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            childMaleCount++;
          } else {
            childFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            infantMaleCount++;
          } else {
            infantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing consultation:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalConsultations = consAdultMaleCount + consAdultFemaleCount + consChildMaleCount + consChildFemaleCount + consInfantMaleCount + consInfantFemaleCount;

    const organizedConsultations = {
      adults: { male: consAdultMaleCount, female: consAdultFemaleCount },
      children: { male: consChildMaleCount, female: consChildFemaleCount },
      infants: { male: consInfantMaleCount, female: consInfantFemaleCount },
      totalConsults: totalConsultations
    };


    res.render('county-dashboard', { user: user, referrals: organizedReferrals, consultations: organizedConsultations });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("An error occurred while processing your request.");
  }
})

async function registerCounty(userData) {
  let res = await query(`/items/county/`, {
    method: 'POST',
    body: JSON.stringify(userData) // Send user data in the request body
  });
  return await res.json();
}

app.post('/county-register', async (req, res) => {
  try {
    const { fullName, email, phone, county, password } = req.body;

    if (!fullName || !email || !phone || !county || !password) {
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const userData = {
      name: fullName, email: email, phone: phone, county: county, password: hashedPassword
    };

    // Register the user
    const newUser = await registerCounty(userData);

    // Send response indicating success
    res.status(201).json({ message: 'User registered successfully', user: newUser });
  } catch (error) {
    console.error('Error inserting user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function loginCounty(email) {
  try {
    // console.log('Querying Directus for user with email:', email);
    const response = await query(`/items/county?filter[email][_eq]=${email}`, {
      method: 'SEARCH',
    });
    const users = await response.json(); // Extract JSON data from the response

    // Check if users array is empty or not
    if (!users || users.length === 0) {
      console.log('No user found with email:', email);
    }

    return users;
  } catch (error) {
    console.error('Error querying user data:', error);
    throw new Error('Error querying user data');
  }
}

app.post('/county-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // console.log('Received login request:', email);

    // Check for missing fields
    if (!email || !password) {
      // console.log('Missing email or password');
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    // Fetch user data from Directus
    // console.log('Fetching user data for email:', email);
    const usersResponse = await loginCounty(email);

    // If usersResponse is empty or undefined, return invalid credentials error
    if (!usersResponse || usersResponse.data.length === 0) {
      // console.log('User not found with email:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = usersResponse.data[0]; // Extract the first user from the response

    // Compare provided password with the hashed password stored in the user's record
    // console.log('Comparing passwords for user:', user.email);
    const passwordMatch = await bcrypt.compare(password, user.password);

    // Handle invalid password
    if (!passwordMatch) {
      console.log('Invalid password for user:', user.email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Store user data in session
    // console.log('User logged in successfully:', user.email);
    req.session.user = user;

    // Send response indicating success
    res.status(200).json({ message: 'User logged in successfully', user });
  } catch (error) {
    // Handle internal server error
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/county/referrals/analytics', async (req, res) => {
  try {
    const user = req.session.user;
    const referralsObj = await getCountyReferrals(user.county);
    // const consultatiionObj = await getDepartmentsConsultations(user.county, user.departments);

    if (!referralsObj) {
      throw new Error("No referrals data found.");
    }

    const referrals = Object.values(referralsObj);

    let adultMaleCount = 0;
    let adultFemaleCount = 0;
    let childMaleCount = 0;
    let childFemaleCount = 0;
    let infantMaleCount = 0;
    let infantFemaleCount = 0;

    // Assuming referrals is a nested array, accessing the first element
    const allReferrals = referrals[0];

    // Ensure referrals is not undefined or null
    if (!allReferrals) {
      throw new Error("Referral data is undefined or null.");
    }

    allReferrals.forEach(referral => {
      try {
        const age = parseInt(referral.client_age);
        const gender = referral.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${referral.client_age}" for referral ID ${referral.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for referral ID ${referral.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            adultMaleCount++;
          } else {
            adultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            childMaleCount++;
          } else {
            childFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            infantMaleCount++;
          } else {
            infantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing referral:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalRefs = adultMaleCount + adultFemaleCount + childMaleCount + childFemaleCount + infantMaleCount + infantFemaleCount;

    const organizedReferrals = {
      adults: { male: adultMaleCount, female: adultFemaleCount },
      children: { male: childMaleCount, female: childFemaleCount },
      infants: { male: infantMaleCount, female: infantFemaleCount },
      totalRefs: totalRefs
    };

    res.render('county-referral-analytics', { user: user, referrals: organizedReferrals, })

  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("An error occurred while processing your request.");
  }
})

app.get('/county/consultations/analytics', async (req, res) => {
  try {
    const user = req.session.user;
    const consultationObj = await getCountyConsultations(user.sub_county);

    if (!consultationObj) {
      throw new Error("No consultation data found.");
    }

    const consultations = Object.values(consultationObj);

    let consAdultMaleCount = 0;
    let consAdultFemaleCount = 0;
    let consChildMaleCount = 0;
    let consChildFemaleCount = 0;
    let consInfantMaleCount = 0;
    let consInfantFemaleCount = 0;

    // Assuming consultations is a nested array, accessing the first element
    const allConsultations = consultations[0];

    // Ensure consultations is not undefined or null
    if (!allConsultations) {
      throw new Error("Consultation data is undefined or null.");
    }

    allConsultations.forEach(consultation => {
      try {
        const age = parseInt(consultation.client_age);
        const gender = consultation.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${consultation.client_age}" for consultation ID ${consultation.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for consultation ID ${consultation.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            consAdultMaleCount++;
          } else {
            consAdultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            consChildMaleCount++;
          } else {
            consChildFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            consInfantMaleCount++;
          } else {
            consInfantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing consultation:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalConsultations = consAdultMaleCount + consAdultFemaleCount + consChildMaleCount + consChildFemaleCount + consInfantMaleCount + consInfantFemaleCount;

    const organizedConsultations = {
      adults: { male: consAdultMaleCount, female: consAdultFemaleCount },
      children: { male: consChildMaleCount, female: consChildFemaleCount },
      infants: { male: consInfantMaleCount, female: consInfantFemaleCount },
      totalConsults: totalConsultations
    };


    res.render('county-consultation-analytics', { user: user, consultations: organizedConsultations });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("An error occurred while processing your request.");
  }
})

app.get('/health/ministry/login', async (req, res) => {
  res.render('ministry-login');
});

app.get('/health/ministry/register', async (req, res) => {
  res.render('ministry-register');
});

async function getConsultations() {
  try {
    const res = await query(`/items/consultation_notifications`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

async function getReferrals() {
  try {
    const res = await query(`/items/referral_notifications`, {
      method: 'GET',
    });
    return await res.json();
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw new Error('Error fetching referrals');
  }
}

app.get('/health/ministry/dashboard', async (req, res) => {
  try {
    const user = req.session.user;
    const referralsObj = await getReferrals();
    // const consultatiionObj = await getDepartmentsConsultations(user.county, user.departments);

    if (!referralsObj) {
      throw new Error("No referrals data found.");
    }

    const referrals = Object.values(referralsObj);

    let adultMaleCount = 0;
    let adultFemaleCount = 0;
    let childMaleCount = 0;
    let childFemaleCount = 0;
    let infantMaleCount = 0;
    let infantFemaleCount = 0;

    // Assuming referrals is a nested array, accessing the first element
    const allReferrals = referrals[0];

    // Ensure referrals is not undefined or null
    if (!allReferrals) {
      throw new Error("Referral data is undefined or null.");
    }

    allReferrals.forEach(referral => {
      try {
        const age = parseInt(referral.client_age);
        const gender = referral.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${referral.client_age}" for referral ID ${referral.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for referral ID ${referral.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            adultMaleCount++;
          } else {
            adultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            childMaleCount++;
          } else {
            childFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            infantMaleCount++;
          } else {
            infantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing referral:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalRefs = adultMaleCount + adultFemaleCount + childMaleCount + childFemaleCount + infantMaleCount + infantFemaleCount;

    const organizedReferrals = {
      adults: { male: adultMaleCount, female: adultFemaleCount },
      children: { male: childMaleCount, female: childFemaleCount },
      infants: { male: infantMaleCount, female: infantFemaleCount },
      totalRefs: totalRefs
    };

    const consultationObj = await getConsultations();

    if (!consultationObj) {
      throw new Error("No consultation data found.");
    }

    const consultations = Object.values(consultationObj);

    let consAdultMaleCount = 0;
    let consAdultFemaleCount = 0;
    let consChildMaleCount = 0;
    let consChildFemaleCount = 0;
    let consInfantMaleCount = 0;
    let consInfantFemaleCount = 0;

    // Assuming consultations is a nested array, accessing the first element
    const allConsultations = consultations[0];

    // Ensure consultations is not undefined or null
    if (!allConsultations) {
      throw new Error("Consultation data is undefined or null.");
    }

    allConsultations.forEach(consultation => {
      try {
        const age = parseInt(consultation.client_age);
        const gender = consultation.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${consultation.client_age}" for consultation ID ${consultation.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for consultation ID ${consultation.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            adultMaleCount++;
          } else {
            adultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            childMaleCount++;
          } else {
            childFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            infantMaleCount++;
          } else {
            infantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing consultation:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalConsultations = consAdultMaleCount + consAdultFemaleCount + consChildMaleCount + consChildFemaleCount + consInfantMaleCount + consInfantFemaleCount;

    const organizedConsultations = {
      adults: { male: consAdultMaleCount, female: consAdultFemaleCount },
      children: { male: consChildMaleCount, female: consChildFemaleCount },
      infants: { male: consInfantMaleCount, female: consInfantFemaleCount },
      totalConsults: totalConsultations
    };


    res.render('ministry-dashboard', { user: user, referrals: organizedReferrals, consultations: organizedConsultations });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("An error occurred while processing your request.");
  }
});

app.get('/health/ministry/referrals/analytics', async (req, res) => {
  try {
    const user = req.session.user;
    const referralsObj = await getReferrals(user.county);
    // const consultatiionObj = await getDepartmentsConsultations(user.county, user.departments);

    if (!referralsObj) {
      throw new Error("No referrals data found.");
    }

    const referrals = Object.values(referralsObj);

    let adultMaleCount = 0;
    let adultFemaleCount = 0;
    let childMaleCount = 0;
    let childFemaleCount = 0;
    let infantMaleCount = 0;
    let infantFemaleCount = 0;

    // Assuming referrals is a nested array, accessing the first element
    const allReferrals = referrals[0];

    // Ensure referrals is not undefined or null
    if (!allReferrals) {
      throw new Error("Referral data is undefined or null.");
    }

    allReferrals.forEach(referral => {
      try {
        const age = parseInt(referral.client_age);
        const gender = referral.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${referral.client_age}" for referral ID ${referral.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for referral ID ${referral.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            adultMaleCount++;
          } else {
            adultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            childMaleCount++;
          } else {
            childFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            infantMaleCount++;
          } else {
            infantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing referral:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalRefs = adultMaleCount + adultFemaleCount + childMaleCount + childFemaleCount + infantMaleCount + infantFemaleCount;

    const organizedReferrals = {
      adults: { male: adultMaleCount, female: adultFemaleCount },
      children: { male: childMaleCount, female: childFemaleCount },
      infants: { male: infantMaleCount, female: infantFemaleCount },
      totalRefs: totalRefs
    };

    res.render('ministry-referral-analytics', { user: user, referrals: organizedReferrals, })

  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("An error occurred while processing your request.");
  }
})

app.get('/health/ministry/consultations/analytics', async (req, res) => {
  try {
    const user = req.session.user;
    const consultationObj = await getConsultations();

    if (!consultationObj) {
      throw new Error("No consultation data found.");
    }

    const consultations = Object.values(consultationObj);

    let consAdultMaleCount = 0;
    let consAdultFemaleCount = 0;
    let consChildMaleCount = 0;
    let consChildFemaleCount = 0;
    let consInfantMaleCount = 0;
    let consInfantFemaleCount = 0;

    // Assuming consultations is a nested array, accessing the first element
    const allConsultations = consultations[0];

    // Ensure consultations is not undefined or null
    if (!allConsultations) {
      throw new Error("Consultation data is undefined or null.");
    }

    allConsultations.forEach(consultation => {
      try {
        const age = parseInt(consultation.client_age);
        const gender = consultation.client_sex;

        if (isNaN(age)) {
          throw new Error(`Invalid age "${consultation.client_age}" for consultation ID ${consultation.id}`);
        }

        if (!gender) {
          throw new Error(`Gender not provided for consultation ID ${consultation.id}`);
        }

        if (age >= 18) {
          if (gender === 'male') {
            consAdultMaleCount++;
          } else {
            consAdultFemaleCount++;
          }
        } else if (age >= 2 && age <= 18) {
          if (gender === 'male') {
            consChildMaleCount++;
          } else {
            consChildFemaleCount++;
          }
        } else {
          if (gender === 'male') {
            consInfantMaleCount++;
          } else {
            consInfantFemaleCount++;
          }
        }
      } catch (error) {
        console.error("Error processing consultation:", error.message);
        // Optionally, you can handle or log these errors differently
      }
    });

    const totalConsultations = consAdultMaleCount + consAdultFemaleCount + consChildMaleCount + consChildFemaleCount + consInfantMaleCount + consInfantFemaleCount;

    const organizedConsultations = {
      adults: { male: consAdultMaleCount, female: consAdultFemaleCount },
      children: { male: consChildMaleCount, female: consChildFemaleCount },
      infants: { male: consInfantMaleCount, female: consInfantFemaleCount },
      totalConsults: totalConsultations
    };


    res.render('ministry-consultation-analytics', { user: user, consultations: organizedConsultations });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("An error occurred while processing your request.");
  }
})

async function registerMinistry(userData) {
  let res = await query(`/items/ministry/`, {
    method: 'POST',
    body: JSON.stringify(userData) // Send user data in the request body
  });
  return await res.json();
}

app.post('/ministry-register', async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body;

    if (!fullName || !email || !phone || !password) {
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const userData = {
      name: fullName, email: email, phone: phone, password: hashedPassword
    };

    // Register the user
    const newUser = await registerMinistry(userData);

    // Send response indicating success
    res.status(201).json({ message: 'User registered successfully', user: newUser });
  } catch (error) {
    console.error('Error inserting user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function loginMinistry(email) {
  try {
    // console.log('Querying Directus for user with email:', email);
    const response = await query(`/items/ministry?filter[email][_eq]=${email}`, {
      method: 'SEARCH',
    });
    const users = await response.json(); // Extract JSON data from the response

    // Check if users array is empty or not
    if (!users || users.length === 0) {
      console.log('No user found with email:', email);
    }

    return users;
  } catch (error) {
    console.error('Error querying user data:', error);
    throw new Error('Error querying user data');
  }
}

app.post('/ministry-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // console.log('Received login request:', email);

    // Check for missing fields
    if (!email || !password) {
      // console.log('Missing email or password');
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    // Fetch user data from Directus
    // console.log('Fetching user data for email:', email);
    const usersResponse = await loginMinistry(email);

    // If usersResponse is empty or undefined, return invalid credentials error
    if (!usersResponse || usersResponse.data.length === 0) {
      // console.log('User not found with email:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = usersResponse.data[0]; // Extract the first user from the response

    // Compare provided password with the hashed password stored in the user's record
    // console.log('Comparing passwords for user:', user.email);
    const passwordMatch = await bcrypt.compare(password, user.password);

    // Handle invalid password
    if (!passwordMatch) {
      console.log('Invalid password for user:', user.email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Store user data in session
    // console.log('User logged in successfully:', user.email);
    req.session.user = user;

    // Send response indicating success
    res.status(200).json({ message: 'User logged in successfully', user });
  } catch (error) {
    // Handle internal server error
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});