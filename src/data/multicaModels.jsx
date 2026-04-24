import ModelPicker from "../components/ModelPicker";
import { useMulticaModels } from "./multicaHooks";

export function ModelPickerWithMultica({ value, onChange }) {
  const { models, error, loading } = useMulticaModels();
  return <ModelPicker value={value} onChange={onChange} extraModels={models} extraError={error} extraLoading={loading} />;
}
