const apiKey = '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';

async function listAll() {
  const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
    headers: { Authorization: 'Bearer ' + apiKey }
  });
  const data = await res.json();
  const models = data.data || [];
  console.log('All model IDs in catalog:');
  console.log(models.map(m => m.id));
}

listAll();
