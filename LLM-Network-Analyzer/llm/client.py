from dotenv import load_dotenv
import os
from openai import OpenAI
import json
from config import MODEL_NAME

load_dotenv()

OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
client = OpenAI(api_key=OPENAI_API_KEY)

def df_to_json(df):
    return df.to_dict(orient="records")

def summarize(df):
    return {
        "total_flows": len(df),
        "total_bytes": int(df["bytes"].sum()),
        "avg_duration": float(df["duration"].mean()),
        "top_talkers": df.groupby("src")["bytes"].sum().nlargest(5).to_dict()
    }

def pass_to_llm(data, prompt):
    response = client.responses.create(
        model=MODEL_NAME,
        input=f"{prompt}\n\n{json.dumps(data, indent=2)}"
    )

    text = response.output[0].content[0].text
    print(text)
    return text