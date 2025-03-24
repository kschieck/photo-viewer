const gulp = require("gulp");
const clean = require("gulp-clean");
const zip = require("gulp-zip");
const shell = require("gulp-shell");

const paths = {
    frontend: "frontend",
    backend: "backend",
    output: "build"
};

// Clean previous build
gulp.task("clean", function () {
    return gulp.src(paths.output, { allowEmpty: true, read: false }).pipe(clean());
});

// Build frontend
gulp.task("build-frontend", shell.task([
    `cd ${paths.frontend} && npm install && npm run build`
]));

// Copy frontend build files
gulp.task("copy-frontend", function () {
    return gulp.src(`${paths.frontend}/build/**/*`).pipe(gulp.dest(`${paths.output}/public`));
});

// Copy backend files (only necessary ones)
gulp.task("copy-backend", function () {
    return gulp.src([
        `${paths.backend}/**/*`,
        `!${paths.backend}/node_modules/**` // Exclude node_modules
    ], { base: paths.backend }).pipe(gulp.dest(`${paths.output}`));
});

// Install backend dependencies in the output folder
gulp.task("install-backend-dependencies", shell.task([
    `cd ${paths.output}/backend && npm install --production`
]));

// Create a zip file
gulp.task("zip", function () {
    return gulp.src(`${paths.output}/**/*`)
        .pipe(zip("deployment.zip"))
        .pipe(gulp.dest("."));
});

// Clean previous build (frontend)
gulp.task("postbuild-clean-frontend", function () {
    return gulp.src(`${paths.frontend}/build`, { allowEmpty: true, read: false }).pipe(clean());
});

// Clean previous build folder
gulp.task("postbuild-clean", function () {
    return gulp.src(paths.output, { allowEmpty: true, read: false }).pipe(clean());
});

// Define the default task to run all tasks in sequence
gulp.task("default", gulp.series(
    "clean",
    "build-frontend",
    "copy-frontend",
    "postbuild-clean-frontend",
    "copy-backend",
    "zip",
    "postbuild-clean"
));

// Define the default task to run all tasks in sequence
gulp.task("build-no-zip", gulp.series(
    "clean",
    "build-frontend",
    "copy-frontend",
    "copy-backend",
    "postbuild-clean-frontend",
));