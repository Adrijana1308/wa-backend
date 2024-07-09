import dotenv from "dotenv";
dotenv.config(); // učitava .env datoteku u process.env

import express from "express";
import cors from "cors";
import connect from "./db.js";
import mongo from "mongodb";
import auth from "./auth.js";

//import * as res from 'express/lib/response';

const app = express(); //instanciranje aplikacije
const port = 3000; // port na kojem će web server slušati

app.use(cors()); //zahtjevi mogu biti poslati iz drugih domen
app.use(express.json()); //zahtjevi mogu biti u JSON formatu, tj. dekodiraj ih u JSON

connect()
  .then(() => {
    console.log("Uspješno spajanje na bazu!");
  })
  .catch((err) => {
    console.error("Došlo je do greške prilikom spajanja na bazu!");
  });

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,HEAD,OPTIONS,POST,PUT,DELETE"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content Type, Accept, Authorization"
  );
  next();
});

function isValidTimeFormat(time){
  const regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return regex.test(time);
} 

// Ovo je test, to se ne koristi u stvarnosti....
app.get("/tajna", [auth.verify], (req, res) => {
  res.json({message: "ovo je tajna " + req.jwt.username});
})

app.post("/auth", async (req, res) => {
  let user = req.body;
  let result;
  try{
    result = await auth.authenticateUser(user.username, user.password);
    res.json(result);
  } catch (error){
    console.error(error);
    res.status(403).json({error: error.message});
  }
});

// Endpoint for user Registration
app.post("/register", async (req, res) => {

    let user = req.body;
    let id;
    try{
      id = await auth.registerUser(user);
      res.json({ id: id });
    } catch (error){
      console.error(error);
      if(error.message === 'Username already exists'){
        res.status(400).json({error: error.message});
      } else{
        res.status(500).json({error: 'Server error!'});
      }
    }
});

// Endpoint for Salon posts / upload
app.post("/posts", async (req, res) => {
  try {
    //Validiraj dolazne podatke
    const {name, location, open, close, source, hairstyles: incomingHairstyles} = req.body;
    const {date, time} = req.body.availability || {};
    const rating = req.body.rating || null; // Default 0
    const hairType = ["short", "medium", "long", "other"];

    const defaultHairstyles = { //Opcionalne defaultne vrijenosti kose
      short: [],
      medium: [],
      long: [],
      other: []
    }; 

    const hairstyles = incomingHairstyles || defaultHairstyles; //Ako nema hairstyles, postavi defaultne vrijednosti


    //Provjera dodavanja tipova frizura i cijena na postu
    //if(hairstyles){
      for(const type of hairType) {
        if(hairstyles[type]){
          //Provjeri dali je tip ispravno formatiran
          if(!Array.isArray(hairstyles[type]) || hairstyles[type].some(hairstyle => !hairstyle.type || !hairstyle.price || !hairstyle.duration)){
            return res.status(400).json({error: `Invalid '${type}' hairstyle format`});
          }
        }
      }
    //}


    const mergedHairstyles = {...defaultHairstyles, ...hairstyles}; //Spoji defaultne vrijednosti i dodane vrijednosti
  //  const selectedDate = date; //Neznam za sad dali mi to treba
  //  const selectedTime = time; //Neznam za sad dali mi to treba


    // const isAvailable = await checkAvailability(date, time)
    // //Provjera slobodnog termina na kalendaru!! Povezi sa kalendarom
    // if(!isAvailable){
    //   return res.status(400).json({error: "Termin je zauzet!"}); //400 Bad Request
    // }


    //Provjera obaveznih podataka
    if (!name || !location || !open || !close || !source) {
      return res.status(400).json({ error: "Missing required fields" }); //400 Bad Request
    }
    //Provjera formata za vrijeme 24H
    if(!isValidTimeFormat(open) || !isValidTimeFormat(close)){
      return res.status(400).json({error: "Upisano krivo vrijeme! "});
    }


    let db = await connect();
    let result = await db.collection("posts").insertOne({
      name,
      location,
      date,
      source,
      open,
      close,
      time,
      hairstyles: mergedHairstyles || {}, // Ako nema onda je default
      rating: 0,
      numOfRatings: 0, // Default 0
      availability: req.body.availability || {}, // Ako nema onda je default
      appointments: [], // Ako nema onda je default
    });


    res.json(result.ops[0]);
  } catch (err) {
    console.error("Greska pri umetanju posta: ", err);
    res.status(500).json({ error: "Server error" });
    return;
  }
});

// Async funtion to check if the selected date and time are available
async function checkAvailability(selectedDate, selectedTime, salonId){
  let db = await connect();
  try {
    const existingAppointments = await db.collection("posts").findOne({
      _id: mongo.ObjectId(salonId),
      appointments: { $elemMatch: { date: selectedDate, time: selectedTime } }
    });
    return !existingAppointments;
  } catch (error) {
    console.error("Error checking availability: ", error);
    throw error;
  }
}

// Endpoint for updating salon details
app.put("/posts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    
    let db = await connect();
    let result = await db.collection("posts").updateOne(
      { _id: mongo.ObjectId(id) },
      { $set: updatedData }
    );

    res.json({ success: true, message: "Salon details updated successfully" });
  } catch (err) {
    console.error("Error updating post: ", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Endpoint for Salon posts / download
app.get("/posts",  async (req, res) => {
  let db = await connect();
  let results;
  try {
    let cursor = await db.collection("posts").find();
    results = await cursor.toArray();
  } catch (e) {
    console.log(e);
  }
  res.json(results);
});

// Enpoint for specific Salon post / donwload
app.get("/posts/:id", async (req, res) => {
  const { id } = req.params;
  const db = await connect();
  const post = await db
    .collection("posts")
    .findOne({ _id: mongo.ObjectId(id) });
  console.log("Post: " + post);
  res.json(post);
});

// Endpoint for deleting specific Salon post
app.delete("/posts/:id", async (req, res) => {
  const { id } = req.params;
  const db = await connect();
  const result = await db
    .collection("posts")
    .deleteOne({ _id: mongo.ObjectId(id) });
  res.json({ success: true, message: "Post deleted successfully" });
});

//Enpoint for making bookings
app.post("/bookings", async (req, res) => {
  try {
    const { date, time, salon_id, hairstyle } = req.body;
    const db = await connect();

    //Check availability
    const isAvailable = await checkAvailability(date, time, salon_id);
    if(!isAvailable){
      return res.status(400).json({error: "Termin je zauzet!"}); //400 Bad Request
    }

    //Make appointment
    const result = await db.collection("posts").updateOne(
    { _id: mongo.ObjectId(salon_id) },
    { $push: { appointments: { date, time, hairstyle } } }
    );
    res.json({success: true, message: "Appointment booked succssfully!"});
  } catch (err) {
    console.error("Error making appointment: ", err);
    res.status(500).json({ error: "Server error" });
  }
})

app.get("/bookings/:salon_id", async (req, res) => {
  const { salon_id } = req.params;
  const db = await connect();
  try {
    const post = await db.collection("posts").findOne(
      {_id: mongo.ObjectId(salon_id) },
      { projection: {appointments: 1 } } // Only return the appointments field , _id: 0
    );
    res.json(post.appointments);
   } catch (error) {
      console.error("Error fetching appointments: ", error);
      res.status(500).json({ error: "Server error" });
    }
  });

app.listen(port, () => console.log(`Slušam na portu ${port}!`));
