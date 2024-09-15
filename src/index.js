import dotenv from "dotenv";
import connect from "./db.js";
import express, { text } from "express";
import cors from "cors";
import mongo from "mongodb";
import auth from "./auth.js";
import nodemailer from "nodemailer";
dotenv.config(); // učitava .env datoteku u process.env

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

const transponder = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function isValidTimeFormat(time) {
  const regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return regex.test(time);
}

app.get("/tajna", [auth.verify], (req, res) => {
  res.json({ message: "ovo je tajna " + req.jwt.username });
});

app.post("/auth", async (req, res) => {
  let user = req.body;
  let result;
  try {
    result = await auth.authenticateUser(user.username, user.password);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(403).json({ error: error.message });
  }
});

function asyncHandler(fn) {
  return function (req, res, next) {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
}

app.post(
  "/register",
  asyncHandler(async (req, res) => {
    console.log("Received User Data:", req.body);

    let user = req.body;
    let id;
    try {
      id = await auth.registerUser(user);
      return res.json({ id: id });
    } catch (error) {
      console.error(error);
      if (error.message === "Username already exists") {
        return res.status(400).json({ error: error.message });
      } else {
        return res.status(500).json({ error: "Server error!" });
      }
    }
  })
);

app.post("/posts", auth.verify, async (req, res) => {
  try {
    const userId = req.jwt._id;

    console.log("User ID from JWT:", userId);

    if (!userId) {
      return res.status(400).json({ error: "User ID is missing or invalid." });
    }

    let userObjectId;
    try {
      userObjectId = new mongo.ObjectId(userId);
    } catch (error) {
      console.error("Invalid User ID format:", error);
      return res.status(400).json({ error: "Invalid User ID format." });
    }

    const {
      name,
      location,
      open,
      close,
      source,
      hairstyles: incomingHairstyles,
    } = req.body;
    const { date, time } = req.body.availability || {};
    const rating = req.body.rating || null; // Default 0
    const hairType = ["short", "medium", "long", "other"];

    const defaultHairstyles = {
      short: [],
      medium: [],
      long: [],
      other: [],
    };

    const hairstyles = incomingHairstyles || defaultHairstyles;

    for (const type of hairType) {
      if (hairstyles[type]) {
        if (
          !Array.isArray(hairstyles[type]) ||
          hairstyles[type].some(
            (hairstyle) =>
              !hairstyle.type || !hairstyle.price || !hairstyle.duration
          )
        ) {
          return res
            .status(400)
            .json({ error: `Invalid '${type}' hairstyle format` });
        }
      }
    }
    //}

    const mergedHairstyles = { ...defaultHairstyles, ...hairstyles };
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
    if (!isValidTimeFormat(open) || !isValidTimeFormat(close)) {
      return res.status(400).json({ error: "Upisano krivo vrijeme! " });
    }

    let db = await connect();
    let result = await db.collection("posts").insertOne({
      userId: userObjectId,
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

async function checkAvailability(selectedDate, selectedTime) {
  try {
    const existingAppointments = await db
      .collection("appointments")
      .find({
        date: selectedDate,
        time: selectedTime,
      })
      .toArray();
    return existingAppointments.length === 0;
  } catch (error) {
    console.error("Error checking availability: ", error);
    throw error;
  }
}

// Endpoint for updating salon details
app.put("/posts/:id", auth.verify, async (req, res) => {
  try {
    const PostId = req.params.id;
    const postData = req.body;
    const userId = req.jwt._id;
    const userRole = req.jwt.role;

    let db = await connect();
    let post = await db
      .collection("posts")
      .findOne({ _id: new mongo.ObjectId(PostId) });

    if (!post) {
      return res.status(404).send({ error: "Post not found!" });
    }
    // Allow superadmin to bypass ownership check
    // Specific Post ownership check
    if (userRole !== "superadmin" && String(post.userId) !== String(userId)) {
      return res.status(403).send({ error: "Zabranjeno!" });
    }

    // Delete _id field from postData if it exists
    delete postData._id;

    let result = await db.collection("posts").updateOne(
      { _id: new mongo.ObjectId(PostId) }, // mozda je greska tu
      { $set: postData }
    );

    console.log("Update result: ", result); // debug line

    res.json({ success: true, message: "Salon details updated successfully" });
  } catch (err) {
    console.error("Error updating post: ", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Endpoint for Salon posts / download
app.get("/posts", async (req, res) => {
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
  try {
    const post = await db
      .collection("posts")
      .findOne({ _id: new mongo.ObjectId(id) });
    console.log("Post: " + post);

    if (!post) {
      return res.status(404).json({ error: "Post not found", post });
    }

    res.json(post);
  } catch (err) {
    console.error("Error fetching post: ", err);
    res.status(500).json({ error: "Error u dohvatu posta!! app.get" });
  }
});

// Endpoint for deleting specific Salon post
app.delete("/posts/:id", auth.verify, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.jwt._id;
    const userRole = req.jwt.role;

    if (!mongo.ObjectId.isValid(postId)) {
      return res.status(400).json({ error: "Invalid post ID format" });
    }

    let db = await connect();
    const post = await db
      .collection("posts")
      .findOne({ _id: new mongo.ObjectId(postId) });

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Allow the post owner or a superadmin to delete
    if (String(post.userId) !== String(userId) && userRole !== "superadmin") {
      return res
        .status(403)
        .json({ error: "Unauthorized: You cannot delete this post." });
    }

    const result = await db
      .collection("posts")
      .deleteOne({ _id: new mongo.ObjectId(postId) });

    if (result.deletedCount === 1) {
      return res.json({ success: true, message: "Post deleted successfully" });
    } else {
      return res
        .status(404)
        .json({ error: "Post not found or already deleted" });
    }
  } catch (err) {
    console.error("Error deleting post:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/bookings", async (req, res) => {
  try {
    const { salonId } = req.query;
    let db = await connect();

    const query = salonId ? { salonId: new mongo.ObjectId(salonId) } : {};
    let bookings = await db
      .collection("bookings")
      .find({ salonId: new mongo.ObjectId(salonId) })
      .toArray();

    res.json(bookings);
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

//Enpoint for making bookings
app.post("/bookings", async (req, res) => {
  try {
    const { salonId, userId, customerName, date, startTime, endTime, service } =
      req.body;

    // Convert userId and salonId to ObjectId
    const userObjectId = new mongo.ObjectId(userId);
    const salonObjectId = new mongo.ObjectId(salonId);

    console.log("Recieved booking data: ", req.body);

    //Connect to the database
    const db = await connect();

    //Fetch user email
    const user = await db
      .collection("users")
      .findOne({ _id: new mongo.ObjectId(userId) });
    const salon = await db
      .collection("posts")
      .findOne({ _id: new mongo.ObjectId(salonId) });
    const salonOwner = await db
      .collection("users")
      .findOne({ _id: new mongo.ObjectId(salon.userId) });

    if (!user || !salon || !salonOwner) {
      return res.status(400).json({ error: "User, salon or owner not found!" });
    }

    // Time format validation
    if (!startTime || !endTime) {
      return res.status(400).json({ error: "Invalid start time or end time!" });
    }

    //Check if time slot is available
    const existingBookings = await db.collection("bookings").findOne({
      salonId: salonId,
      date: date,
      $or: [
        { startTime: { $lt: endTime, $gte: startTime } },
        { endTime: { $lt: startTime, $gte: endTime } },
      ],
    });

    if (existingBookings) {
      return res
        .status(400)
        .json({ error: "Desired reservation is not available!" });
    }

    // Create booking
    const result = await db.collection("bookings").insertOne({
      // salonId,
      // userId,
      salonId: salonObjectId,
      userId: userObjectId,
      customerName,
      //customerName: user.fullName,
      date,
      startTime,
      endTime,
      service,
    });

    //Prepare email content
    const customerMailOptions = {
      from: process.env.EMAIL_USER,
      to: user.username,
      subject: `Your appointment with ${salon.name} is confirmed`,
      text: `Dear Customer, \n\nYour appointment for ${service} at ${salon.name} is confiremd! \n\nDate: ${date}\nTime: ${startTime} - ${endTime}\n\nThank you for choosing us!`,
    };

    const ownerMailOptions = {
      from: process.env.EMAIL_USER,
      to: salonOwner.username,
      subject: `New appointment at your salon: ${salon.name}`,
      text: `Dear ${salon.name}, \n\nYou have a new appointment. \n\nService: ${service}\nCustomer Email: ${user.username}\nDate: ${date}\nTime: ${startTime} - ${endTime}\n\nPlease prepare for the appointmenmt!`,
    };

    // Send emails
    await transponder.sendMail(customerMailOptions);
    await transponder.sendMail(ownerMailOptions);

    res.json({ success: true, bookingId: result.insertedId });
  } catch (err) {
    console.error("Error making appointment: ", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Endpoint for canceling a booking
// Endpoint za brisanje pojedinačne rezervacije (booking)
app.delete("/bookings/:id", auth.verify, async (req, res) => {
  try {
    const bookingId = req.params.id;
    const userId = req.jwt._id;

    if (!mongo.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ error: "Invalid booking ID format" });
    }

    let db = await connect();
    const booking = await db
      .collection("bookings")
      .findOne({ _id: new mongo.ObjectId(bookingId) });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Provjeri je li korisnik vlasnik booking-a ili vlasnik salona
    const post = await db
      .collection("posts")
      .findOne({ _id: new mongo.ObjectId(booking.salonId) });

    if (
      String(booking.userId) !== String(userId) &&
      String(post.userId) !== String(userId) &&
      !req.isSuperAdmin
    ) {
      return res
        .status(403)
        .json({ error: "Unauthorized: You cannot delete this booking." });
    }

    // Brisanje rezervacije
    const result = await db
      .collection("bookings")
      .deleteOne({ _id: new mongo.ObjectId(bookingId) });

    if (result.deletedCount === 1) {
      return res.json({
        success: true,
        message: "Booking deleted successfully",
      });
    } else {
      return res.status(404).json({ error: "Booking not found" });
    }
  } catch (err) {
    console.error("Error deleting booking:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Endpoint to rate a post
app.post("/posts/:id/rate", auth.verify, async (req, res) => {
  try {
    const { id } = req.params;
    let { rating } = req.body;

    // Ensure rating is a number, in case it was passed as a string
    rating = Number(rating);

    // Validate the rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5." });
    }

    const db = await connect();
    const post = await db
      .collection("posts")
      .findOne({ _id: new mongo.ObjectId(id) });

    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    // Ensure the rating and number of ratings are initialized
    const currentRating = post.rating || 0; // Default to 0 if null
    const currentNumOfRatings = post.numOfRatings || 0; // Default to 0 if null

    // Log the current state
    console.log(`Current Rating: ${currentRating}`);
    console.log(`Current Number of Ratings: ${currentNumOfRatings}`);
    console.log(`Incoming Rating: ${rating}`);

    // Calculate the total sum of previous ratings
    const totalRatingSum = currentRating * currentNumOfRatings;
    console.log(`Total Rating Sum (before adding new): ${totalRatingSum}`);

    // Add the new rating to the total rating sum
    const newTotalRatingSum = totalRatingSum + rating;
    console.log(`New Total Rating Sum: ${newTotalRatingSum}`);

    // Calculate the new number of ratings
    const newNumOfRatings = currentNumOfRatings + 1;
    console.log(`New Number of Ratings: ${newNumOfRatings}`);

    // Calculate the updated average rating
    const updatedRating = newTotalRatingSum / newNumOfRatings;
    console.log(
      `Updated Rating Calculation: (${newTotalRatingSum}) / ${newNumOfRatings}`
    );
    console.log(`Updated Rating: ${updatedRating}`);

    // Update the post with the new rating and number of ratings
    await db
      .collection("posts")
      .updateOne(
        { _id: new mongo.ObjectId(id) },
        { $set: { rating: updatedRating, numOfRatings: newNumOfRatings } }
      );

    res.json({
      success: true,
      rating: updatedRating,
      numOfRatings: newNumOfRatings,
    });
  } catch (err) {
    console.error("Error rating post: ", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(port, () => console.log(`Slušam na portu ${port}!`));
