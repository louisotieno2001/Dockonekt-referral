const express = require('express')
const app = express()
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const ejs = require('ejs');
require('dotenv').config();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
  res.render('registration')
})

app.get('/login', async (req, res)=>{
    res.render('login');
});

app.get('/home', async (req,res) => {
    res.render('home');
});

app.get('/referral', async (req,res) =>{
  res.render('referral-form');
})

app.get('/specimen-movement', async (req, res) => {
  res.render('specimen-movement-form');
})

app.get('/consultation', async (req, res) => {
  res.render('consultation-form');
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})