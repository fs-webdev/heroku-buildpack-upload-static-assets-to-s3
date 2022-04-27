const path = require('path');
const fs = require('fs');
const semverGt = require('semver/functions/gt')
const semverValid = require('semver/functions/valid')
// heroku buildpack dir or local test
const buildDir = process.env.BUILD_DIR || '../'
const bpDir = process.env.BP_DIR || '../'
const deps = require(path.join(bpDir, 'deps.json'));
// get host app's package.json
const package = require(path.join(buildDir, 'package.json'));
console.log('Flattening dependencies for', package.name, '...');

const output = {
  name: deps.name,
  version: deps.version
}

const recursiveSearch = (obj, searchKey, results = []) => {
  const r = results;
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    // push package version
    if (key !== searchKey && typeof value === 'object' && value.hasOwnProperty('version')) {
      r.push({ name: key, version: value.version });
    }
    // recurse into deps
    if (key === searchKey && typeof value === 'object') {
      recursiveSearch(value, searchKey, r);
    }
    // recurse into sub-deps
    if (typeof value === 'object' && value.hasOwnProperty(searchKey)) {
      recursiveSearch(value[searchKey], searchKey, r);
    }
  });
  return r;
};

function findDepVersion(deps, searchKey) {
  let dep = {name: searchKey};
  for (const d of deps) {
    if (d.name === searchKey) {
      dep = d;
      break;
    }
  };
  return dep
}

const deepDeps = recursiveSearch(deps, 'dependencies');
console.log("Deep dependency count:", deepDeps.length);

// dedupe deps, keeping the highest semver version for each
const dedupedDeps = deepDeps.reduce((acc, dep) => {
  const existing = acc.find(d => d.name === dep.name);
  if (existing) {
    console.log('exists, versions:', existing.version, dep.version);
    if (semverValid(existing.version) && semverValid(dep.version) && semverGt(dep.version, existing.version)) {
      acc.splice(acc.indexOf(existing), 1, dep);
    }
  } else {
    acc.push(dep);
  }
  return acc;
}, []);
console.log("Deduped dependency count:", dedupedDeps.length);


// normal deps
output.deps = package.dependencies ? Object.keys(package.dependencies).map(d => findDepVersion(dedupedDeps, d)): [];
output.devDeps = package.devDependencies ? Object.keys(package.devDependencies).map(d => findDepVersion(dedupedDeps, d)) : [];
output.peerDeps = package.peerDependencies ? Object.keys(package.peerDependencies).map(d => findDepVersion(dedupedDeps, d)) : [];
// deps that aren't in deps, devDeps, or peerDeps
output.secondaryDeps = dedupedDeps.filter(d => !output.deps.includes(d) && !output.devDeps.includes(d) && !output.peerDeps.includes(d));

// Write to file
fs.writeFileSync(path.join(bpDir, 'deps.json.flat'), JSON.stringify(output, null, 2));