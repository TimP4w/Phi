export default abstract class UseCase<Input, Output> {
  abstract execute(input: Input): Output;
}
