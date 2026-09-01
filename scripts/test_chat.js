const apiKey = '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';

async function testStructured(model) {
  console.log('Testing structured JSON on:', model);
  const start = Date.now();
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an AI task breakdown engine. Always return ONLY a raw JSON array (no markdown code blocks, no explanation) of structured tasks: [{"name": "Task name", "category": "Work", "priority": "high", "description": "Short details"}]'
        },
        { role: 'user', content: 'Break down: Launch a marketing campaign' }
      ],
      max_tokens: 400,
      temperature: 0.2
    })
  });
  const data = await res.json();
  console.log('Status:', res.status, 'Time:', Date.now() - start, 'ms');
  console.log('Output:\n', data.choices?.[0]?.message?.content);
}

async function run() {
  await testStructured('meta/llama-3.2-11b-vision-instruct');
  await testStructured('ibm/granite-3.0-8b-instruct');
  await testStructured('openai/gpt-oss-120b');
}

run();
