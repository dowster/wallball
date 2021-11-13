/**
To change this license header, choose License Headers in Project Properties.
To change this template file, choose Tools | Templates
and open the template in the editor.
*/

package Powerups;

import Game.Game;
import Game.PowerUp;
import java.awt.Graphics;
import java.awt.Point;

/**
 
 @author schmidmichae
 */
public class FastPaddle extends PowerUp 
{

   public static int SPEED_INCREASE_AMOUNT = 10;
   private int oldSpeed;
   
   public FastPaddle(Point location)
   {
      this.location = new Point(location);
      icon = SmallPaddle.class.getResource("/res/powerupImages/FastPaddle.png");
   }
   
   @Override
   public void tick(Game game)
   {
      super.tick(game);   
   }

   @Override
   public void init(Game game)
   {
      oldSpeed = player.getPaddleMovementDistance();
      player.setPaddleMovementDistance(oldSpeed + SPEED_INCREASE_AMOUNT);
   }

   @Override
   public void end(Game game)
   {
      player.setPaddleMovementDistance(oldSpeed);
   }

   @Override
   public void draw(Game game, Graphics w)
   {
      
   }

}
