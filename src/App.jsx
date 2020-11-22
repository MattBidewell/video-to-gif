import React, { useState, useEffect } from 'react';
import './App.css';

import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";

/**
 * Goal - Upload some audio split the audio on the silences.
 * 
 * FFMPEG will log where audio silence starts and ends.
 * Using a custon logger function we can grab those logs(I dont like it.)
 * Can turn those logs into instructions to cut the audio.
 * 
 * TODO 
 * - UI
 * - flush logs (maybe flush on a fresh button press.)
 */


const ffmpeg = createFFmpeg({ log: true, logger: saveLoggerOutput });

let silenceLogs = [];

function App() {

    const [ready, setReady] = useState(false);
    const [upload, setUpload] = useState();
    const [audio, setAudio] = useState();

    const load = async () => {
        await ffmpeg.load();
        setReady(true);
    }

    useEffect(() => {
        load();
    }, [])

    const seperateAudio = async () => {
        try {
            silenceLogs = []; // flush logs.

            const mimeType = "ogg" 
            ffmpeg.FS("writeFile", `upload.${mimeType}`, await fetchFile(upload));

            // run this to get silence logs
            await ffmpeg.run("-i", "upload.ogg", "-af", "silencedetect=noise=-30dB:d=0.5", "-f", "null", "dummy.txt");
            let index = 0;
            const files = [];
            // console.log(silenceLogs)

            // needs to be a sync
            for (let[index,silenceLog] of silenceLogs.entries()) {
                // if its an end log then use it to process the trim
                // console.log(index, silenceLog)
                if (silenceLog.includes("end") && index !== silenceLogs.length - 1) {
                    // console.log(silenceLog);
                    //  ffmpeg -ss <silence_end - 0.25> -t <next_silence_start - silence_end + 2 * 0.25> -i input.mov word-N.mov
                    const silenceEnd = extractSilenceEnd(silenceLog);
                    const nextSilenceStart = extractNextSilenceStart(silenceEnd);
                    
                    const startTime = silenceEnd - 0.25; // need to turn in 00:01:00
                    const durationTime = nextSilenceStart - silenceEnd + 2 * 0.25;

                    const formattedStart = new Date(startTime * 1000).toISOString().substr(11,12);
                    const formatedDurationTime = new Date(durationTime * 1000).toISOString().substr(11, 12);
                    
                    // const startTime1 = "00:00:08.5859"; // 8.58596 -t 1.8020399999999999
                    // const durationTime1 = "00:00:01.8020";

                    // console.log("command", `ffmpeg -ss ${formattedStart} -t ${formatedDurationTime} -i upload.ogg ${index}.ogg`);
                    await ffmpeg.run("-i", "upload.ogg", "-ss", formattedStart, "-t", formatedDurationTime, `${index}.ogg`);

                    const data = ffmpeg.FS("readFile", `${index}.ogg`);
                    const url = URL.createObjectURL(new Blob([data.buffer], { type: "audio/ogg" }));
                    files.push(url);
                    index++;
                }
            }
            index = 0;
            console.log("jobDone");
            setAudio(files);
        } catch (err) {
            console.error(err);
        }
    }

    return ready ? (
        <div className="App">
            {upload && <video controls width="250" src={URL.createObjectURL(upload)}></video>}
            <input type="file" onChange={(e) => setUpload(e?.target?.files?.item(0))}></input>

            <h3>Result</h3>
            <button onClick={seperateAudio}>Seperate Audio</button>

            {audio && audio.map((value) => {
                console.log(value);
                <audio controls width="250" src={value}></audio>
            })}
        </div>
    ) : (<p>Loading...</p>);
}

function saveLoggerOutput(log) {
    if (log.message.includes("silencedetect") && !log.message.includes("run")) {
        silenceLogs.push(log.message);
    }
}

// using the end log, gets the next start value.
function extractNextSilenceStart(silenceEndLog) {
    const logIndex = silenceLogs.findIndex(log => log.includes(silenceEndLog));
    const nextStartLog = silenceLogs[logIndex + 1];
    const [prexix, suffix] = nextStartLog.split("start:");
    const [number] = suffix.split("|");
    return Number(number.trim());
}

// returns a number of the end of a silence
function extractSilenceEnd(log) {
    const [prefix, suffix] = log.split("end:");
    const [number] = suffix.split("|");
    return Number(number.trim());
}

export default App;

/*
 */