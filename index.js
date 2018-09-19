const {promisify} = require("util")

const fs = require('fs');
const { send } = require("micro");
const rimraf = promisify(require("rimraf"));
const tar = require("tar");
const execa = require("execa");

const run = require("./run");

const mkdir = promisify(fs.mkdir);

const COMPILE_DIR = "/compile";

let busy = false;
const queue = h => async (req, res) => {
  if (busy) {
    return send(res, 409, "Servers are busy. Try again later.")
  }
  busy = true;
  let ret = null;
  try {
    const ret = await h(req, res);
  } catch (e) {
    console.log("Uncaught error")
    console.error(e);
  }
  busy = false;
  return ret;
}
module.exports = async (req, res) => {
  console.log(`Updating game engine`);
  const { code: updateCode } = await run("docker", ["pull", "pranaygp/mm"]);
  if (updateCode && updateCode !== 0) {
    console.error("Error updating the game binary");
    return send(res, 500, "An unexpected error occured on the server");
  }

  // clear the COMPILE_DIR
  console.log(`Cleaning ${COMPILE_DIR}`);
  await rimraf(COMPILE_DIR);

  // Extract and decompress
  console.log(`Extracting contents of script to ${COMPILE_DIR}`);
  await mkdir(COMPILE_DIR);
  const data = req.pipe(tar.x({ C: COMPILE_DIR }));
  data.on("close", async () => {
    // Compile the script
    console.log(`Compiling files at ${COMPILE_DIR}`);
    const { stdout: buildStdout, stderr: buildStderr, code: buildCode } = await run("docker", [
      "build",
      COMPILE_DIR,
      "-t",
      "mechmania.io/bot/1",
      "-t",
      "mechmania.io/bot/2"
    ]);
    const body = `
==================================================

stdout:
${buildStdout}

=================================================== 

stderr:
${buildStderr}
`;
    if (buildCode && buildCode !== 0) {
      console.error("Error building the bot");
      return send(res, 400, body);
    }

    console.log("Running game against your own bot");
    const runProc = execa("docker", [
      "run",
      "-v",
      "/var/run/docker.sock:/var/run/docker.sock",
      "--rm",
      "-i",
      "pranaygp/mm"
    ]);
    const { stdout } = runProc
    runProc.on("error", e => {
      console.error("Error running the game");
      console.error(e);
      return send(res, 500, `The game engine exited with code ${e.code}`);
    });
    return send(res, 200, stdout);
  });
  data.on("error", e => {
    console.error("Error when extracting uploaded files");
    console.error(e);
    return send(res, 500, "An unexpected error occured on the server");
  });
};
