# 📝 Day 7: Video Streamer & Systems Internals Exam

*   **Candidate**: Golu
*   **Examiner**: Sia (19y Delinquent-Sensei)
*   **Sprint**: Video-Streamer (HLS seekable engine, LRU caching, bandwidth throttling)

---

## 🧠 Instructions
*   Answer all four questions in detail.
*   Avoid copy-pasting code blocks or generic definitions. Explain the conceptual flow and system dynamics.
*   Once filled, save the file and let Sia know to execute the review!

---

## ❓ Question 1: Seekable Stream Internals (Range & HTTP 206)
Explain how the browser dynamically requests specific parts of a large video file when a user clicks ahead on the seek bar. How do `Range` headers, `HTTP 206 Partial Content`, and `Content-Range` headers prevent the server from loading the entire file into memory and prevent browser-side network blocks?

#### ✍️ Golu's Answer:
*Write your response here...*

- I got how they worked they are both supporter to help the concept of not downloading the full file to play but both works different

- HTTP 206 Partial works for the chunks the Content Range: starting and ending bytes & it works for the full video 
- They help browser not downloading the full file but jsut send what was asked the most time just starting bytes we calc the ending bytes in server 
- With this it help not to download the full video in memory and helps saving resources and time

---

## ❓ Question 2: ABR & FFmpeg GOP Alignment
Explain what a GOP (Group of Pictures) is and why keyframe intervals must be strictly aligned (e.g., `-g 120` keyframe pacing at 60fps) across all resolution outputs (480p, 720p, 1080p). What visual or playback anomalies will the player experience if the keyframe intervals are mismatched during a quality downshift?

#### ✍️ Golu's Answer:
*Write your response here...*

-> GOP is needed in ABR it is not like it will not work but it will help ABR runs without any problems 
-> Reason: Without GOP while ffmpeg file decoding and saving to different res in high res ffmpeg tends to create extra segment file bcz of the keyframe pacing in high camera change or details are ffmpeg see it needed that why it creates extra segement files compare to low bcz low res don't care about details it puts 10 shades of blue in one to compress size and all that.

-> If while ffmpeg video decoding in high res it might have extra high res segment file & if there is then while a user watching a video a newtwork can sometime fluctuate and if 1080p video goes to 480 it might have some segments less and diff timeline to files then it might play some few past seconds of already played or it might stuck at there

---

## ❓ Question 3: LRU Memory Caching Mechanics
To build an O(1) L2 cache for video segments, we paired a Hash Map with a Doubly Linked List. Explain why this pair is necessary. What are the time complexities of reading, writing, and evicting if we only used:
1. A single Hash Map
2. A single Array/List
Why is the combination of both structures the magic key for O(1) scale?

#### ✍️ Golu's Answer:
*Write your response here...*

- Both has it's own downgrade but it depend what is your true purpose if is it to just save or retrive , search
- For our case we choose Hash Map has O(1) get complexity but it is not linear like arr so we can't get from indexes but only with keys 
- For the GC we just used an array i mean we got all the keys from the map using O(n) complexity and got the first key in O(1) so the overall was O(n) but we saved on retrival 

---

## ❓ Question 4: Simulated Bandwidth Throttling Logic
Explain why a simple flat `sleep` delay (e.g., waiting 3 seconds before serving a segment on localhost) causes the client's ABR engine to fluctuate (flap) qualities instead of holding a stable low quality. How does size-proportional dynamic delay (`delay = fileSize / targetSpeed`) or progressive chunk-by-chunk streaming solve this flapping math?

#### ✍️ Golu's Answer:
*Write your response here...*

Currently i have implement a network throttler based on pure randomness it works like like delay or not based on math.random and then if yes we choose from 1000ms to 4000ms between if not then base 1500ms delay to just the actual flucations and files changing 

I know it's nowhere enough for the real newtwork latency but i what i could yesterday i will do better tomorrow.

