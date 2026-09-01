const apiKey = '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';

async function testFastModel() {
  const models = [
    'mistralai/mistral-large-2-instruct',
    'nvidia/llama-3.1-nemotron-70b-instruct',
    'mistralai/mistral-7b-instruct-v0.3'
  ];

  for (const m of models) {
    console.log('Testing model:', m);
    const start = Date.now();
    try {
      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: m,
          messages: [
            {
              role: 'system',
              content: 'You are an AI task assistant. Return only a valid JSON array of structured tasks: [{"name":"...","category":"Work","priority":"high","description":"..."}]'
            },
            { role: 'user', content: 'Generate 2 steps to plan an event' }
          ],
          max_tokens: 300,
          temperature: 0.2
        })
      });

      const data = await res.json();
      console.log('Status:', res.status, 'Time:', Date.now() - start, 'ms');
      if (res.status === 200) {
        console.log('SUCCESS Response from', m);
        console.log('Content:', data.choices?.[0]?.message?.content);
        return m;
      }
    } catch (e) {
      console.error(e);
    }
  }
}

testFastModel();
