const apiKey = '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';

async function scanAllModels() {
  const modelsRes = await fetch('https://integrate.api.nvidia.com/v1/models', {
    headers: { Authorization: 'Bearer ' + apiKey }
  });
  const { data } = await modelsRes.json();
  const modelIds = data.map(m => m.id);

  console.log('Scanning', modelIds.length, 'models in batches...');

  for (let i = 0; i < modelIds.length; i += 5) {
    const batch = modelIds.slice(i, i + 5);
    const promises = batch.map(async (m) => {
      try {
        const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: m,
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 5
          })
        });
        if (res.status === 200) {
          const json = await res.json();
          return { model: m, ok: true, resp: json.choices?.[0]?.message?.content };
        }
        return { model: m, ok: false, status: res.status };
      } catch (e) {
        return { model: m, ok: false, error: e.message };
      }
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.ok) {
        console.log('>>> WORKING MODEL FOUND:', r.model);
        console.log('Sample output:', r.resp);
        return r.model;
      }
    }
  }
  console.log('Scan finished, no working model found.');
}

scanAllModels();
